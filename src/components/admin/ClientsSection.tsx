'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  suggestNextCaseNumber,
  generateId,
  formatCurrency,
  formatDate,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  normalizeClientStatus,
  getStatusMeta,
  type ClientRecord,
  type ClientComment,
  type ClientHistoryEntry,
  type CanonicalClientStatus,
  type AppealType,
  type ClientsDataFile,
} from '@/lib/clients-data'
import { STATUS_GROUPS } from '@/lib/case-statuses'
import {
  getLastLocalSaveLabel,
  loadClientsMerged,
  saveClientsMerged,
} from '@/lib/clients-persistence'
import { exportToCSV, downloadCSV } from '@/lib/admin-store'
import {
  fetchCrmWorkClients,
  type CrmWorkClient,
} from '@/lib/crm-bridge'

const emptyForm = () => ({
  clientName: '', iin: '', phone: '', email: '',
  type: 'fraud' as AppealType,
  amount: 0, payoutAmount: 0, paidAmount: 0,
  bank: 'Kaspi Bank',
  status: 'Новый' as CanonicalClientStatus,
  regulatorNote: '', internalNote: '',
  caseNumber: '',
  updatedAtDate: new Date().toISOString().slice(0, 10),
  crmClientId: undefined as number | undefined,
  coreUserId: undefined as number | undefined,
})

export function ClientsSection() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CanonicalClientStatus | 'all'>('all')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [commentText, setCommentText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [syncHint, setSyncHint] = useState<string | null>(null)

  const [showCrmPicker, setShowCrmPicker] = useState(false)
  const [crmQ, setCrmQ] = useState('')
  const [crmLoading, setCrmLoading] = useState(false)
  const [crmItems, setCrmItems] = useState<CrmWorkClient[]>([])
  const [crmError, setCrmError] = useState('')
  const [crmTotal, setCrmTotal] = useState(0)

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 6000)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    const data = await loadClientsMerged()
    setClients(data.clients)
    setSyncHint(getLastLocalSaveLabel())
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const persist = async (next: ClientRecord[], message: string) => {
    setSaving(true)
    const payload: ClientsDataFile = { version: 1, updatedAt: new Date().toISOString(), clients: next }
    const res = await saveClientsMerged(payload, message)
    setSaving(false)
    setClients(next)
    setSyncHint(getLastLocalSaveLabel())

    if (res.github.ok) {
      showToast('ok', 'Сохранено локально и отправлено в GitHub. На сайте обновится через 1–2 минуты после деплоя.')
      return true
    }
    showToast('err', `${res.github.error} Запись уже в списке ниже — поиск на сайте работает в этом браузере.`)
    return true
  }

  const filtered = useMemo(() => {
    let result = clients
    if (statusFilter !== 'all') {
      result = result.filter(c => normalizeClientStatus(c.status) === statusFilter)
    }
    const min = amountMin ? Number(amountMin) : 0
    const max = amountMax ? Number(amountMax) : Infinity
    if (amountMin || amountMax) {
      result = result.filter(c => {
        const v = c.payoutAmount || c.amount
        return v >= min && v <= max
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const digits = search.replace(/\D/g, '')
      result = result.filter(c =>
        c.clientName.toLowerCase().includes(q) ||
        c.caseNumber.toLowerCase().includes(q) ||
        c.phone.replace(/\D/g, '').includes(digits) ||
        c.iin.includes(digits) ||
        c.email.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [clients, search, statusFilter, amountMin, amountMax])

  const openAdd = () => {
    setEditId(null)
    setForm({ ...emptyForm(), caseNumber: suggestNextCaseNumber(clients) })
    setShowForm(true)
  }

  const loadCrm = async (q = crmQ) => {
    setCrmLoading(true)
    setCrmError('')
    const res = await fetchCrmWorkClients(q, 100)
    setCrmLoading(false)
    if (!res.ok) {
      setCrmItems([])
      setCrmTotal(0)
      setCrmError(res.error)
      return
    }
    setCrmItems(res.items)
    setCrmTotal(res.total)
  }

  const openCrmPicker = async () => {
    setShowCrmPicker(true)
    await loadCrm('')
  }

  const pickCrmClient = (item: CrmWorkClient) => {
    const already = clients.find(
      c =>
        (item.crmClientId && c.crmClientId === item.crmClientId) ||
        (item.coreUserId && c.coreUserId === item.coreUserId) ||
        c.caseNumber === item.suggestedCaseNumber,
    )
    if (already) {
      showToast('err', `Клиент уже в реестре сайта: ${already.caseNumber}`)
      setShowCrmPicker(false)
      openEdit(already)
      return
    }
    const kzt = item.amountKzt || 0
    setEditId(null)
    setForm({
      ...emptyForm(),
      clientName: item.fullName,
      iin: item.iin || '',
      phone: item.phone || '',
      email: item.email || '',
      amount: kzt,
      payoutAmount: kzt,
      paidAmount: 0,
      caseNumber: item.suggestedCaseNumber,
      crmClientId: item.crmClientId,
      coreUserId: item.coreUserId ?? undefined,
      status: 'На рассмотрении',
      regulatorNote: '',
      internalNote: `Импорт из CRM #${item.crmClientId}${item.coreUserId ? ` · Core #${item.coreUserId}` : ''} · баланс ${item.walletAmount} ${item.walletCurrency}`,
      updatedAtDate: new Date().toISOString().slice(0, 10),
    })
    setShowCrmPicker(false)
    setShowForm(true)
  }

  const openEdit = (c: ClientRecord) => {
    setEditId(c.id)
    setForm({
      clientName: c.clientName, iin: c.iin, phone: c.phone, email: c.email,
      type: c.type, amount: c.amount, payoutAmount: c.payoutAmount, paidAmount: c.paidAmount,
      bank: c.bank,
      status: normalizeClientStatus(c.status),
      regulatorNote: c.regulatorNote,
      internalNote: c.internalNote,
      caseNumber: c.caseNumber,
      updatedAtDate: (c.updatedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      crmClientId: c.crmClientId,
      coreUserId: c.coreUserId,
    })
    setShowForm(true)
  }

  const saveForm = async () => {
    if (!form.clientName.trim() || !form.phone.trim()) {
      showToast('err', 'Укажите ФИО и телефон — без них клиент не сохранится.')
      return
    }
    const stamp = form.updatedAtDate
      ? new Date(`${form.updatedAtDate}T12:00:00`).toISOString()
      : new Date().toISOString()
    let next: ClientRecord[]

    if (editId) {
      const old = clients.find(c => c.id === editId)
      if (!old) return
      const history: ClientHistoryEntry[] = [...old.history]
      if (old.status !== form.status) {
        history.push({ id: generateId(), field: 'status', oldValue: old.status, newValue: form.status, author: 'Администратор', createdAt: stamp })
      }
      if (old.amount !== form.amount) {
        history.push({ id: generateId(), field: 'amount', oldValue: String(old.amount), newValue: String(form.amount), author: 'Администратор', createdAt: stamp })
      }
      next = clients.map(c => c.id === editId
        ? {
            ...c,
            clientName: form.clientName,
            iin: form.iin,
            phone: form.phone,
            email: form.email,
            type: form.type,
            amount: form.amount,
            payoutAmount: form.payoutAmount,
            paidAmount: form.paidAmount,
            bank: form.bank,
            status: form.status,
            regulatorNote: form.regulatorNote,
            internalNote: form.internalNote,
            caseNumber: form.caseNumber.trim() || c.caseNumber,
            crmClientId: form.crmClientId ?? c.crmClientId,
            coreUserId: form.coreUserId ?? c.coreUserId,
            history,
            updatedAt: stamp,
          }
        : c)
    } else {
      const record: ClientRecord = {
        id: generateId(),
        caseNumber: form.caseNumber.trim() || suggestNextCaseNumber(clients),
        clientName: form.clientName,
        iin: form.iin,
        phone: form.phone,
        email: form.email,
        type: form.type,
        amount: form.amount,
        payoutAmount: form.payoutAmount,
        paidAmount: form.paidAmount,
        bank: form.bank,
        status: form.status,
        regulatorNote: form.regulatorNote,
        internalNote: form.internalNote,
        comments: [],
        history: [],
        createdAt: stamp,
        updatedAt: stamp,
        crmClientId: form.crmClientId,
        coreUserId: form.coreUserId,
      }
      next = [record, ...clients]
    }

    const ok = await persist(next, editId ? `admin: update ${editId}` : 'admin: new client from CRM/manual')
    if (ok) { setShowForm(false); setEditId(null) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить запись?')) return
    const next = clients.filter(c => c.id !== id)
    await persist(next, `admin: delete ${id}`)
  }

  const handleMassDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Удалить ${selectedIds.size} записей?`)) return
    const next = clients.filter(c => !selectedIds.has(c.id))
    const ok = await persist(next, `admin: mass delete ${selectedIds.size}`)
    if (ok) setSelectedIds(new Set())
  }

  const handleExport = () => {
    const selected = clients.filter(c => selectedIds.has(c.id))
    const data = selected.length > 0 ? selected : clients
    downloadCSV(`clients-export-${Date.now()}.csv`, exportToCSV(data))
  }

  const addCommentToClient = async (clientId: string) => {
    if (!commentText.trim()) return
    const comment: ClientComment = {
      id: generateId(), text: commentText.trim(),
      author: 'Администратор', createdAt: new Date().toISOString(),
    }
    const next = clients.map(c => c.id === clientId
      ? { ...c, comments: [...c.comments, comment], updatedAt: new Date().toISOString() }
      : c)
    const ok = await persist(next, `admin: comment ${clientId}`)
    if (ok) setCommentText('')
  }

  const quickStatus = async (client: ClientRecord, status: CanonicalClientStatus) => {
    const now = new Date().toISOString()
    const next = clients.map(c => c.id === client.id
      ? {
          ...c,
          status,
          history: [...c.history, { id: generateId(), field: 'status', oldValue: c.status, newValue: status, author: 'Администратор', createdAt: now }],
          updatedAt: now,
        }
      : c)
    await persist(next, `admin: status ${client.caseNumber} → ${status}`)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === filtered.length) { setSelectedIds(new Set()); return }
    setSelectedIds(new Set(filtered.map(c => c.id)))
  }

  const statusBadge = (s: string) => {
    const meta = getStatusMeta(s)
    return `px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.adminClass}`
  }

  const statusLabel = (s: string) => normalizeClientStatus(s)

  const typeLabel = (t: AppealType) => TYPE_OPTIONS.find(o => o.value === t)?.label || t

  return (
    <div>
      {toast && (
        <div className={`admin-toast admin-toast--${toast.type}`} role="status">
          {toast.text}
        </div>
      )}
      {saving && (
        <div className="admin-saving-overlay" aria-hidden>
          <div className="admin-spinner" />
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Клиенты и обращения</h1>
          <p className="text-white/40 text-sm">
            {loading
              ? 'Загрузка…'
              : `Всего: ${clients.length} · локально + data.json${syncHint ? ` · сохранено ${syncHint}` : ''}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={reload} disabled={loading} className="premium-btn premium-btn-outline text-sm !py-2 !px-3">
            Обновить
          </button>
          <button type="button" onClick={openCrmPicker} className="premium-btn premium-btn-primary text-sm !py-2 !px-4">
            + Из CRM «В работе»
          </button>
          <button type="button" onClick={openAdd} className="premium-btn premium-btn-outline text-sm !py-2 !px-4">
            + Вручную
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по ФИО, № дела, телефону, ИИН, email…"
          className="admin-input flex-1" />
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CanonicalClientStatus | 'all')} className="admin-input sm:w-52">
            <option value="all">Все статусы</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={amountMin} onChange={e => setAmountMin(e.target.value)} className="admin-input sm:w-36" type="number" placeholder="Сумма от ₸" />
          <input value={amountMax} onChange={e => setAmountMax(e.target.value)} className="admin-input sm:w-36" type="number" placeholder="Сумма до ₸" />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-premium-gold/10 border border-premium-gold/20 rounded-xl flex-wrap">
          <span className="text-white/70 text-sm">Выбрано: {selectedIds.size}</span>
          <button type="button" onClick={handleMassDelete} className="text-red-400 hover:text-red-300 text-sm font-medium">Удалить</button>
          <button type="button" onClick={handleExport} className="text-premium-gold hover:text-premium-gold-light text-sm font-medium">Экспорт CSV</button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-white/40 hover:text-white/60 text-sm ml-auto">Снять выделение</button>
        </div>
      )}

      <div className="md:hidden space-y-3 mb-4">
        {filtered.map(c => (
          <article key={c.id} className="admin-client-card">
            <div className="flex justify-between items-start gap-2 mb-2">
              <div>
                <p className="text-premium-gold font-mono text-xs">{c.caseNumber}</p>
                <p className="text-white font-medium">{c.clientName}</p>
                {c.crmClientId ? <p className="text-white/30 text-[11px]">CRM #{c.crmClientId}</p> : null}
              </div>
              <span className={statusBadge(c.status)}>{statusLabel(c.status)}</span>
            </div>
            <p className="text-white/50 text-sm mb-2">{formatCurrency(c.payoutAmount || c.amount)} · {formatDate(c.updatedAt)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => openEdit(c)} className="text-premium-gold text-sm">Изменить</button>
              <button type="button" onClick={() => handleDelete(c.id)} className="text-red-400 text-sm">Удалить</button>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden md:block admin-table-wrap mb-4">
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr>
                <th className="w-8"><input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={selectAll} /></th>
                <th>Дело</th>
                <th>Клиент</th>
                <th>Сумма ₸</th>
                <th>Статус</th>
                <th>План выплаты</th>
                <th>Тип</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td className="font-mono text-premium-gold text-xs">{c.caseNumber}</td>
                  <td>
                    <button type="button" className="text-left text-white hover:text-premium-gold" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                      {c.clientName}
                    </button>
                    {c.crmClientId ? <div className="text-white/30 text-[11px]">CRM #{c.crmClientId}{c.coreUserId ? ` · Core #${c.coreUserId}` : ''}</div> : null}
                  </td>
                  <td>{formatCurrency(c.payoutAmount || c.amount)}</td>
                  <td>
                    <select
                      className="admin-input !py-1 !px-2 text-xs max-w-[11rem]"
                      value={normalizeClientStatus(c.status)}
                      onChange={e => quickStatus(c, e.target.value as CanonicalClientStatus)}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="text-white/50 text-xs whitespace-nowrap">{formatDate(c.updatedAt)}</td>
                  <td className="text-white/40 text-xs">{typeLabel(c.type)}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button type="button" onClick={() => openEdit(c)} className="text-white/40 hover:text-premium-gold p-1 text-xs" title="Редактировать">✎</button>
                      <button type="button" onClick={() => handleDelete(c.id)} className="text-white/40 hover:text-red-400 p-1 text-xs" title="Удалить">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-white/30 text-sm">Нет записей</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {expandedId && (() => {
          const client = clients.find(c => c.id === expandedId)
          if (!client) return null
          return (
            <div className="border-t border-white/5 p-4 bg-white/[0.02]">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-white/80 text-sm font-semibold mb-2">Комментарии ({client.comments.length})</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
                    {client.comments.length === 0 && <p className="text-white/30 text-xs">Нет комментариев</p>}
                    {client.comments.map(cm => (
                      <div key={cm.id} className="bg-white/5 rounded-lg p-2.5">
                        <div className="flex justify-between text-xs text-white/30 mb-1">
                          <span>{cm.author}</span>
                          <span>{formatDate(cm.createdAt)}</span>
                        </div>
                        <p className="text-white/70 text-sm">{cm.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Внутренний комментарий…" className="admin-input flex-1 text-sm" onKeyDown={e => e.key === 'Enter' && addCommentToClient(client.id)} />
                    <button type="button" onClick={() => addCommentToClient(client.id)} className="premium-btn premium-btn-primary text-xs !py-1.5 !px-3">Добавить</button>
                  </div>
                </div>
                <div>
                  <h3 className="text-white/80 text-sm font-semibold mb-2">История ({client.history.length})</h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {client.history.length === 0 && <p className="text-white/30 text-xs">Нет изменений</p>}
                    {client.history.map(h => (
                      <div key={h.id} className="flex items-start gap-2 text-xs">
                        <span className="text-premium-gold mt-0.5">●</span>
                        <div>
                          <span className="text-white/50">{formatDate(h.createdAt)} — </span>
                          <span className="text-white/70">{h.field}: </span>
                          <span className="text-red-400 line-through">{h.oldValue}</span>
                          <span className="text-white/30"> → </span>
                          <span className="text-green-400">{h.newValue}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {client.regulatorNote && (
                    <p className="mt-3 text-xs text-white/50"><strong className="text-white/70">Для клиента:</strong> {client.regulatorNote}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {showCrmPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCrmPicker(false)}>
          <div className="bg-premium-navy-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">Клиенты CRM «В работе»</h2>
            <p className="text-white/40 text-xs mb-4">ФИО, ИИН, телефон и сумма подтягиваются из CRM/Core. Статус и комментарий на сайте задаёте вы.</p>
            <div className="flex gap-2 mb-3">
              <input
                value={crmQ}
                onChange={e => setCrmQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadCrm(crmQ)}
                placeholder="Поиск в CRM…"
                className="admin-input flex-1"
              />
              <button type="button" onClick={() => loadCrm(crmQ)} disabled={crmLoading} className="premium-btn premium-btn-primary text-sm !py-2 !px-4">
                {crmLoading ? '…' : 'Найти'}
              </button>
            </div>
            {crmError && <p className="text-red-400 text-sm mb-3">{crmError}</p>}
            {!crmError && (
              <p className="text-white/35 text-xs mb-2">{crmLoading ? 'Загрузка…' : `Найдено: ${crmTotal}`}</p>
            )}
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {crmItems.map(item => (
                <button
                  key={item.crmClientId}
                  type="button"
                  onClick={() => pickCrmClient(item)}
                  className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:border-premium-gold/40 hover:bg-premium-gold/5 p-3 transition-colors"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-white font-medium">{item.fullName}</span>
                    <span className="text-premium-gold font-mono text-xs">{item.suggestedCaseNumber}</span>
                  </div>
                  <div className="text-white/45 text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{item.phone || 'нет телефона'}</span>
                    <span>ИИН {item.iin || '—'}</span>
                    <span>{item.amountKzt.toLocaleString('ru-RU')} ₸</span>
                    <span>CRM #{item.crmClientId}</span>
                  </div>
                </button>
              ))}
              {!crmLoading && !crmError && crmItems.length === 0 && (
                <p className="text-white/30 text-sm py-6 text-center">Нет клиентов со статусом «В работе»</p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setShowCrmPicker(false)} className="premium-btn premium-btn-outline text-sm !py-2 !px-4">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-premium-navy-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">{editId ? 'Редактировать' : 'Клиент на сайте'}</h2>
            {(form.crmClientId || form.coreUserId) && (
              <p className="text-white/40 text-xs mb-3">
                Связь: {form.crmClientId ? `CRM #${form.crmClientId}` : ''}{form.coreUserId ? ` · Core #${form.coreUserId}` : ''}
              </p>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">№ дела</label>
                  <input value={form.caseNumber} onChange={e => setForm(v => ({ ...v, caseNumber: e.target.value }))} className="admin-input font-mono" />
                </div>
                <div>
                  <label className="admin-label">Планируемая выплата (дата в общем списке)</label>
                  <input type="date" value={form.updatedAtDate} onChange={e => setForm(v => ({ ...v, updatedAtDate: e.target.value }))} className="admin-input" />
                  <p className="text-white/35 text-[11px] mt-1">Чем раньше дата — тем выше клиент в публичном списке (быстрее очередь).</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">ФИО *</label>
                  <input value={form.clientName} onChange={e => setForm(v => ({ ...v, clientName: e.target.value }))} className="admin-input" />
                </div>
                <div>
                  <label className="admin-label">ИИН</label>
                  <input value={form.iin} onChange={e => setForm(v => ({ ...v, iin: e.target.value }))} className="admin-input" maxLength={12} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">Телефон *</label>
                  <input value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))} className="admin-input" />
                </div>
                <div>
                  <label className="admin-label">Email</label>
                  <input value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} className="admin-input" type="email" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">Сумма ущерба (₸)</label>
                  <input value={form.amount || ''} onChange={e => setForm(v => ({ ...v, amount: Number(e.target.value) || 0 }))} className="admin-input" type="number" />
                </div>
                <div>
                  <label className="admin-label">Сумма к возврату (₸)</label>
                  <input value={form.payoutAmount || ''} onChange={e => setForm(v => ({ ...v, payoutAmount: Number(e.target.value) || 0 }))} className="admin-input" type="number" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">Оплачено (₸)</label>
                  <input value={form.paidAmount || ''} onChange={e => setForm(v => ({ ...v, paidAmount: Number(e.target.value) || 0 }))} className="admin-input" type="number" />
                </div>
                <div>
                  <label className="admin-label">Банк</label>
                  <input value={form.bank} onChange={e => setForm(v => ({ ...v, bank: e.target.value }))} className="admin-input" />
                </div>
              </div>
              <div>
                <label className="admin-label">Статус на сайте</label>
                <select value={form.status} onChange={e => setForm(v => ({ ...v, status: e.target.value as CanonicalClientStatus }))} className="admin-input">
                  {STATUS_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="admin-label">Комментарий для клиента (на сайте)</label>
                <textarea value={form.regulatorNote} onChange={e => setForm(v => ({ ...v, regulatorNote: e.target.value }))} className="admin-input min-h-[72px]" rows={2} />
              </div>
              <div>
                <label className="admin-label">Внутренняя заметка</label>
                <textarea value={form.internalNote} onChange={e => setForm(v => ({ ...v, internalNote: e.target.value }))} className="admin-input min-h-[72px]" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowForm(false)} className="premium-btn premium-btn-outline text-sm !py-2 !px-4">Отмена</button>
              <button type="button" onClick={saveForm} disabled={saving} className="premium-btn premium-btn-primary text-sm !py-2 !px-4">
                {saving ? 'Сохранение…' : editId ? 'Сохранить' : 'Опубликовать на сайте'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
