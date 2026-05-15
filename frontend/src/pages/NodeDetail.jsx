import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import styles from './NodeDetail.module.css'
import { copyText } from '../utils/clipboard'

const API = import.meta.env.VITE_API_URL ?? '/api'

const ERROR_COLORS = {
  timeout:            '#f87171',
  connection_refused: '#fb923c',
  dns_error:          '#facc15',
  tls_error:          '#a78bfa',
  reality_error:      '#f472b6',
  outbound_error:     '#ff6b6b',
  connection_reset:   '#94a3b8',
  other_error:        '#6b7280',
}

const ERROR_LABELS = {
  timeout:            'Таймаут',
  connection_refused: 'Отказ соединения',
  dns_error:          'DNS ошибка',
  tls_error:          'TLS ошибка',
  reality_error:      'Reality ошибка',
  outbound_error:     'Исходящий трафик',
  connection_reset:   'Сброс соединения',
  other_error:        'Прочие ошибки',
}

const RANGES = [
  { label: '1ч',  hours: 1 },
  { label: '6ч',  hours: 6 },
  { label: '24ч', hours: 24 },
  { label: '7д',  hours: 168 },
]

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtAxisTime(ts, hours) {
  const d = new Date(ts)
  if (hours <= 6)  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (hours <= 24) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru-RU', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ErrorLogsModal({ node, errorType, label, hours, onClose }) {
  const [logs, setLogs]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)
  const preRef = useRef(null)

  useEffect(() => {
    const since = hours <= 1 ? '1h' : hours <= 6 ? '6h' : hours <= 24 ? '24h' : `${hours}h`
    fetch(`${API}/logs?node=${encodeURIComponent(node)}&error_type=${encodeURIComponent(errorType)}&limit=30&since=${since}`)
      .then(r => r.json())
      .then(data => { setLogs(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => { setLogs([]); setLoading(false) })
  }, [node, errorType, hours])

  function copyAll() {
    if (!logs?.length) return
    const text = logs.map(e => `${e.ts}  ${e.message}`).join('\n')
    copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span className={styles.modalDot} style={{ background: ERROR_COLORS[errorType] }} />
            {label}
            <span className={styles.modalSub}>последние 30 событий</span>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.copyBtn} onClick={copyAll} disabled={!logs?.length}>
              {copied ? '✓ Скопировано' : 'Копировать'}
            </button>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>
        <div className={styles.modalBody} ref={preRef}>
          {loading && <p className={styles.modalHint}>Загрузка...</p>}
          {!loading && !logs?.length && <p className={styles.modalHint}>Нет записей</p>}
          {logs?.map((e, i) => (
            <div key={i} className={styles.modalRow}>
              <span className={styles.modalTs}>{new Date(e.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className={styles.modalMsg}>{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function NodeDetail() {
  const { name } = useParams()
  const navigate = useNavigate()
  const [hours, setHours]       = useState(24)
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [errorModal, setErrorModal] = useState(null)

  // правила мониторинга
  const [rules, setRules]           = useState(null) // null = загружается
  const [ruleCounts, setRuleCounts] = useState({})
  const [showForm, setShowForm]     = useState(false)
  const [ruleName, setRuleName]     = useState('')
  const [ruleKw, setRuleKw]         = useState('')
  const [ruleErr, setRuleErr]       = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/node-stats?node=${encodeURIComponent(name)}&hours=${hours}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [name, hours])

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/node-rules?node=${encodeURIComponent(name)}&hours=${hours}`, { credentials: 'include' })
      if (!res.ok) return
      const d = await res.json()
      setRules(d.rules ?? [])
      setRuleCounts(d.counts ?? {})
    } catch {}
  }, [name, hours])

  async function addRule(e) {
    e.preventDefault()
    if (!ruleName.trim()) { setRuleErr('Введи название'); return }
    if (!ruleKw.trim())   { setRuleErr('Введи ключевые слова'); return }
    setRuleSaving(true); setRuleErr('')
    try {
      const res = await fetch(`${API}/node-rules?node=${encodeURIComponent(name)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ruleName.trim(), keywords: ruleKw }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRuleName(''); setRuleKw(''); setShowForm(false)
      await loadRules()
    } catch (err) {
      setRuleErr(err.message)
    } finally {
      setRuleSaving(false)
    }
  }

  async function deleteRule(ruleId) {
    await fetch(`${API}/node-rules?node=${encodeURIComponent(name)}&ruleId=${ruleId}`, {
      method: 'DELETE', credentials: 'include',
    })
    await loadRules()
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { loadRules() }, [loadRules])

  // ── ECharts options ──────────────────────────────────────────────────────

  function areaChartOption() {
    if (!data?.series?.length) return {}

    // Собираем все временные метки
    const allTs = [...new Set(
      data.series.flatMap(s => s.values.map(([ts]) => ts))
    )].sort((a, b) => a - b)

    const series = data.series.map(s => {
      const map = Object.fromEntries(s.values)
      return {
        name:      ERROR_LABELS[s.error_type] ?? s.error_type,
        type:      'line',
        stack:     'total',
        areaStyle: { opacity: 0.6 },
        smooth:    true,
        symbol:    'none',
        lineStyle: { width: 1.5 },
        itemStyle: { color: ERROR_COLORS[s.error_type] ?? '#94a3b8' },
        data:      allTs.map(ts => map[ts] ?? 0),
      }
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#111827',
        borderColor: '#1e2736',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: params => {
          const ts = allTs[params[0]?.dataIndex]
          let html = `<div style="color:#4b5563;margin-bottom:6px">${fmtAxisTime(ts, hours)}</div>`
          params.forEach(p => {
            if (p.value > 0)
              html += `<div style="display:flex;gap:8px;align-items:center">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
                <span>${p.seriesName}</span>
                <span style="margin-left:auto;font-weight:600;color:#e2e8f0">${p.value}</span>
              </div>`
          })
          return html
        },
      },
      legend: {
        top: 0,
        textStyle: { color: '#8892a4', fontSize: 11 },
        icon: 'circle',
        itemWidth: 8, itemHeight: 8,
      },
      grid: { top: 40, right: 16, bottom: 40, left: 48, containLabel: false },
      xAxis: {
        type: 'category',
        data: allTs.map(ts => fmtAxisTime(ts, hours)),
        axisLine:  { lineStyle: { color: '#1e2736' } },
        axisTick:  { show: false },
        axisLabel: { color: '#4b5563', fontSize: 11, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#0f1623' } },
        axisLabel: { color: '#4b5563', fontSize: 11 },
      },
      series,
    }
  }

  function pieChartOption() {
    if (!data?.totals?.length) return {}
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#111827',
        borderColor: '#1e2736',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: p => `${p.name}: <b>${p.value}</b> (${p.percent}%)`,
      },
      legend: { show: false },
      series: [{
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '50%'],
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          color: '#8892a4',
          fontSize: 11,
        },
        labelLine: { lineStyle: { color: '#374151' } },
        data: data.totals.map(t => ({
          name:      ERROR_LABELS[t.error_type] ?? t.error_type,
          value:     t.total,
          itemStyle: { color: ERROR_COLORS[t.error_type] ?? '#6b7280' },
        })),
      }],
    }
  }

  const totalErrors = data?.totals?.reduce((s, t) => s + t.total, 0) ?? 0

  return (
    <main className="page">
      {/* Шапка */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.back} onClick={() => navigate('/nodes')}>← Ноды</button>
          <h1>{name}</h1>
        </div>
        <div className={styles.rangeBar}>
          {RANGES.map(r => (
            <button
              key={r.hours}
              className={`${styles.rangeBtn} ${hours === r.hours ? styles.rangeBtnActive : ''}`}
              onClick={() => setHours(r.hours)}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {loading && <p className={styles.hint}>Загрузка данных...</p>}
      {error   && <p className={styles.err}>Ошибка: {error}</p>}

      {!loading && !error && data && (
        <>
          {/* Сводные карточки */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statVal} style={{ color: totalErrors > 0 ? '#f87171' : '#22c55e' }}>
                {totalErrors.toLocaleString()}
              </span>
              <span className={styles.statLabel}>Ошибок за {RANGES.find(r => r.hours === hours)?.label}</span>
            </div>
            {data.totals.slice(0, 4).map(t => (
              <div key={t.error_type} className={styles.statCard}>
                <span className={styles.statVal} style={{ color: ERROR_COLORS[t.error_type] }}>
                  {t.total.toLocaleString()}
                </span>
                <span className={styles.statLabel}>{ERROR_LABELS[t.error_type] ?? t.error_type}</span>
              </div>
            ))}
          </div>

          {totalErrors === 0 ? (
            <div className={styles.noErrors}>
              <div className={styles.noErrorsIcon}>✓</div>
              <p>Ошибок за выбранный период не найдено</p>
            </div>
          ) : (
            <>
              {/* Графики */}
              <div className={styles.charts}>
                <div className={styles.chartCard}>
                  <div className={styles.chartTitle}>Ошибки по времени</div>
                  <ReactECharts
                    option={areaChartOption()}
                    style={{ height: 280 }}
                    theme="dark"
                    opts={{ renderer: 'canvas' }}
                  />
                </div>

                <div className={`${styles.chartCard} ${styles.chartCardPie}`}>
                  <div className={styles.chartTitle}>Распределение</div>
                  <ReactECharts
                    option={pieChartOption()}
                    style={{ height: 280 }}
                    theme="dark"
                    opts={{ renderer: 'canvas' }}
                  />
                </div>
              </div>

              {/* Легенда типов */}
              <div className={styles.legend}>
                {data.totals.map(t => (
                  <button
                    key={t.error_type}
                    className={styles.legendItem}
                    onClick={() => setErrorModal({ errorType: t.error_type, label: ERROR_LABELS[t.error_type] ?? t.error_type })}
                    title="Показать последние события"
                  >
                    <span className={styles.legendDot} style={{ background: ERROR_COLORS[t.error_type] }} />
                    <span className={styles.legendLabel}>{ERROR_LABELS[t.error_type] ?? t.error_type}</span>
                    <span className={styles.legendCount}>{t.total.toLocaleString()}</span>
                  </button>
                ))}
              </div>

              {/* Последние ошибки */}
              {data.recent.length > 0 && (
                <div className={styles.recentCard}>
                  <div className={styles.recentTitle}>Последние ошибки</div>
                  <div className={styles.recentList}>
                    {data.recent.map((e, i) => (
                      <div key={i} className={styles.recentRow}>
                        <span className={styles.recentTs}>{fmtTime(e.ts)}</span>
                        <span
                          className={styles.recentType}
                          style={{ color: ERROR_COLORS[e.error_type] ?? '#6b7280' }}
                        >
                          {ERROR_LABELS[e.error_type] ?? e.error_type}
                        </span>
                        <span className={styles.recentMsg}>{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      {errorModal && (
        <ErrorLogsModal
          node={name}
          errorType={errorModal.errorType}
          label={errorModal.label}
          hours={hours}
          onClose={() => setErrorModal(null)}
        />
      )}

      {/* ── Мониторинг логов ────────────────────────────────────────────── */}
      <div className={styles.rulesSection}>
        <div className={styles.rulesSectionHeader}>
          <span className={styles.rulesSectionTitle}>Мониторинг логов</span>
          {rules?.length > 0 && !showForm && (
            <button className={styles.addRuleBtn} onClick={() => setShowForm(true)}>+ Добавить</button>
          )}
        </div>

        {rules === null && <p className={styles.hint}>Загрузка...</p>}

        {rules?.length === 0 && !showForm && (
          <div className={styles.emptyRules}>
            <div className={styles.emptyRulesIcon}>📋</div>
            <p className={styles.emptyRulesTitle}>Настрой мониторинг логов</p>
            <p className={styles.emptyRulesHint}>
              Добавь правило — укажи название и ключевые слова.<br />
              Система будет считать совпадения в логах ноды за выбранный период.
            </p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ Добавить правило</button>
          </div>
        )}

        {rules?.length > 0 && (
          <div className={styles.ruleCards}>
            {rules.map(r => (
              <div key={r.id} className={styles.ruleCard}>
                <div className={styles.ruleCardTop}>
                  <span className={styles.ruleCardCount}>{(ruleCounts[r.id] ?? 0).toLocaleString()}</span>
                  <button className={styles.ruleCardDel} onClick={() => deleteRule(r.id)} title="Удалить правило">✕</button>
                </div>
                <span className={styles.ruleCardName}>{r.name}</span>
                <span className={styles.ruleCardKw}>{r.keywords.join(', ')}</span>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <form className={styles.ruleForm} onSubmit={addRule}>
            <div className={styles.ruleFormFields}>
              <div className={styles.ruleFormField}>
                <label className={styles.ruleFormLabel}>Название</label>
                <input
                  className={styles.ruleFormInput}
                  placeholder="Таймауты"
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.ruleFormField}>
                <label className={styles.ruleFormLabel}>Ключевые слова <span className={styles.ruleFormHint}>через запятую</span></label>
                <input
                  className={styles.ruleFormInput}
                  placeholder="timeout, i/o timeout, timed out"
                  value={ruleKw}
                  onChange={e => setRuleKw(e.target.value)}
                />
              </div>
            </div>
            {ruleErr && <p className={styles.ruleFormErr}>{ruleErr}</p>}
            <div className={styles.ruleFormActions}>
              <button type="button" className={styles.ruleFormCancel} onClick={() => { setShowForm(false); setRuleErr('') }}>Отмена</button>
              <button type="submit" className="btn-primary" disabled={ruleSaving}>
                {ruleSaving ? 'Сохраняю...' : 'Сохранить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
