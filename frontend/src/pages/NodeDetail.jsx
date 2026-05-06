import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import styles from './NodeDetail.module.css'

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

export default function NodeDetail() {
  const { name } = useParams()
  const navigate = useNavigate()
  const [hours, setHours]   = useState(24)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

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

  useEffect(() => { load() }, [load])

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
                  <div key={t.error_type} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: ERROR_COLORS[t.error_type] }} />
                    <span className={styles.legendLabel}>{ERROR_LABELS[t.error_type] ?? t.error_type}</span>
                    <span className={styles.legendCount}>{t.total.toLocaleString()}</span>
                  </div>
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
    </main>
  )
}
