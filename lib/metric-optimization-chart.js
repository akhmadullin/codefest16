class MetricOptimizationChart extends HTMLElement {
  static get observedAttributes() {
    return [
      'metric-title',
      'start-value',
      'target-value',
      'thresholds',
      'optimizations',
      'value-suffix',
      'chart-height',
      'highlight-last-step',
    ];
  }

  constructor() {
    super();
    this.chart = null;
    this.canvasId = `metric-chart-${Math.random().toString(36).slice(2, 10)}`;
    this.renderFrame = null;
    this.resizeObserver = null;
    // this.handleWindowResize = this.handleWindowResize.bind(this);
  }

  connectedCallback() {
    this.render();
    // this.setupResizeTracking();
  }

  disconnectedCallback() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    // this.teardownResizeTracking();
    this.destroyChart();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this.render();
    }
  }

  destroyChart() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  // setupResizeTracking() {
  //   if (this.resizeObserver) {
  //     return;
  //   }

  //   this.resizeObserver = new ResizeObserver(() => {
  //     this.render();
  //   });

  //   this.resizeObserver.observe(this);
  //   window.addEventListener('resize', this.handleWindowResize);
  // }

  // teardownResizeTracking() {
  //   if (this.resizeObserver) {
  //     this.resizeObserver.disconnect();
  //     this.resizeObserver = null;
  //   }

  //   window.removeEventListener('resize', this.handleWindowResize);
  // }

  // handleWindowResize() {
  //   // this.render();
  // }

  parseNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  parseJsonAttribute(name, fallback) {
    const raw = this.getAttribute(name);

    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Invalid JSON in "${name}"`, error);
      return fallback;
    }
  }

  formatValue(value, { withSuffix = true } = {}) {
    const suffix = this.getAttribute('value-suffix') || '';
    const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return withSuffix && suffix ? `${rounded}${suffix}` : rounded;
  }

  formatDelta(delta) {
    let sign = delta < 0 ? '−' : '+';
    if (delta === 0) {
      sign = '';
    }
    return `${sign}${this.formatValue(Math.abs(delta), { withSuffix: false })}`;
  }

  getThresholdStatus(value, thresholds) {
    const good = this.parseNumber(thresholds.good, Infinity);
    const warning = this.parseNumber(thresholds.warning, Infinity);
    const bad = this.parseNumber(thresholds.bad, Infinity);

    if (value <= good) {
      return 'good';
    }

    if (value <= warning) {
      return 'warning';
    }

    if (value <= bad || bad === Infinity) {
      return 'bad';
    }

    return 'bad';
  }

  getStatusAccent(status) {
    if (status === 'good') {
      return '#2dd4a0';
    }

    if (status === 'warning') {
      return '#f5c35b';
    }

    return '#ff7f7f';
  }

  getChartMax(values) {
    const maxValue = Math.max(...values, 1);
    const padded = maxValue * 1.15;

    if (padded <= 200) {
      return Math.ceil(padded / 20) * 20;
    }

    if (padded <= 1000) {
      return Math.ceil(padded / 50) * 50;
    }

    return Math.ceil(padded / 100) * 100;
  }

  getTickStep(maxValue) {
    if (maxValue <= 200) {
      return 20;
    }

    if (maxValue <= 600) {
      return 50;
    }

    if (maxValue <= 1200) {
      return 100;
    }

    return 200;
  }

  getBarFontSize(barWidth, { min = 9, max = 16, ratio = 0.22 } = {}) {
    return Math.max(min, Math.min(max, Math.round(barWidth * ratio)));
  }

  shouldHighlightLastStep() {
    const value = this.getAttribute('highlight-last-step');
    return value !== null && value !== 'false';
  }

  getRenderPixelRatio(chartWrap) {
    // const baseDpr = Math.max(window.devicePixelRatio || 1, 1);
    // const slide = this.closest('.slide');

    // if (!slide) {
    //   return baseDpr;
    // }

    // const rect = slide.getBoundingClientRect();
    // const layoutWidth = slide.clientWidth || chartWrap.clientWidth || rect.width;

    // if (!layoutWidth || !rect.width) {
    //   return baseDpr;
    // }

    // const scaleX = rect.width / layoutWidth;
    // const correctedDpr = scaleX > 0 ? baseDpr / scaleX : baseDpr;
    // return Math.min(Math.max(correctedDpr, baseDpr), 4);
    return 8;
  }

  buildData() {
    const metricTitle = this.getAttribute('metric-title') || 'Metric';
    const startValue = this.parseNumber(this.getAttribute('start-value'));
    const targetValue = this.parseNumber(this.getAttribute('target-value'));
    const thresholds = this.parseJsonAttribute('thresholds', {});
    const optimizations = this.parseJsonAttribute('optimizations', []).filter(
      (item) => item && typeof item.label === 'string' && Number.isFinite(Number(item.delta))
    ).map((item) => ({
      label: item.label,
      delta: Number(item.delta),
    }));

    const labels = ['Базовое', ...optimizations.map((item) => item.label)];
    const values = [startValue];
    let running = startValue;

    optimizations.forEach((item) => {
      running += item.delta;
      values.push(Math.max(0, running));
    });

    const currentValue = values[values.length - 1];
    const improvement = startValue === 0
      ? 0
      : Math.round(((startValue - currentValue) / startValue) * 100);

    return {
      metricTitle,
      startValue,
      targetValue,
      thresholds,
      optimizations,
      labels,
      values,
      currentValue,
      improvement,
      status: this.getThresholdStatus(currentValue, thresholds),
    };
  }

  ensureChartJs() {
    if (!window.Chart) {
      console.warn('Chart.js is not loaded');
      return false;
    }

    return true;
  }

  render() {
    const data = this.buildData();
    const highlightLastStep = this.shouldHighlightLastStep();
    const startStatus = this.getThresholdStatus(data.startValue, data.thresholds);
    const targetStatus = data.targetValue > 0
      ? this.getThresholdStatus(data.targetValue, data.thresholds)
      : null;
    const startAccentColor = this.getStatusAccent(startStatus);
    const accentColor = this.getStatusAccent(data.status);
    const targetAccentColor = targetStatus ? this.getStatusAccent(targetStatus) : accentColor;
    const targetLabel = data.targetValue > 0
      ? `&lt; ${this.formatValue(data.targetValue)}`
      : '—';
    const improvementText = `${Math.abs(data.improvement)}%`;
    const chartHeight = this.parseNumber(this.getAttribute('chart-height'), 380);

    this.destroyChart();

    this.innerHTML = `
      <style>
        metric-optimization-chart {
          display: block;
          width: 100%;
          color: #e8eaf0;
          font-family: 'Montserrat', sans-serif;
        }

        metric-optimization-chart * {
          box-sizing: border-box;
        }

        metric-optimization-chart .card {
          /*background: #0d0f14;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 28px 30px 22px;
          width: 100%;
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.24);*/
          overflow: hidden;
        }

        metric-optimization-chart .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        metric-optimization-chart .title {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        metric-optimization-chart .subtitle {
          font-size: 12px;
          color: #69708a;
          color: #e8eaf0;
          margin-top: 4px;
        }

        metric-optimization-chart .stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        metric-optimization-chart .stat {
          /*background: #13161e;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;*/
          padding: 8px 14px;
          min-width: 112px;
          text-align: right;
        }

        metric-optimization-chart .stat-label {
          color: #596077;
          color: #e8eaf0;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          font-weight: 700;
        }

        metric-optimization-chart .stat-value {
          margin-top: 2px;
          font-size: 18px;
          line-height: 1.2;
          font-weight: 700;
        }

        metric-optimization-chart .muted {
          color: #7a7f92;
        }

        metric-optimization-chart .accent {
          color: ${accentColor};
        }

        metric-optimization-chart .chart-wrap {
          position: relative;
          width: 100%;
          height: ${chartHeight}px;
          min-height: ${chartHeight}px;
          overflow: hidden;
        }

        metric-optimization-chart canvas {
          display: block;
          width: 100%;
          height: ${chartHeight}px;
        }
      </style>
      <div class="card">
        <div class="header">
          <div>
            <div class="title">${this.escapeHtml(data.metricTitle)} — результаты оптимизации</div>
            <div class="subtitle">75 перцентиль</div>
          </div>
          <div class="stats">
            <div class="stat">
              <div class="stat-label">Базовое</div>
              <div class="stat-value" style="color:${startAccentColor};">${this.formatValue(data.startValue)}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Итог</div>
              <div class="stat-value accent">${this.formatValue(data.currentValue)}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Цель</div>
              <div class="stat-value" style="color:${targetAccentColor};">${targetLabel}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Улучшение</div>
              <div class="stat-value" style="color:#5b8dee;">${improvementText}</div>
            </div>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="${this.canvasId}" height="${chartHeight}"></canvas>
        </div>
      </div>
    `;

    if (!this.ensureChartJs()) {
      return;
    }

    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;

      const canvas = this.querySelector(`#${this.canvasId}`);
      const chartWrap = this.querySelector('.chart-wrap');

      if (!canvas || !chartWrap) {
        return;
      }

      const displayWidth = Math.max(1, Math.round(chartWrap.clientWidth));
      const displayHeight = chartHeight;
      const dpr = this.getRenderPixelRatio(chartWrap);

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      const good = this.parseNumber(data.thresholds.good, NaN);
      const warning = this.parseNumber(data.thresholds.warning, NaN);
      const bad = this.parseNumber(data.thresholds.bad, NaN);
      const suggestedMax = this.getChartMax(data.values);
      const tickStep = this.getTickStep(suggestedMax);

      const zonePlugin = {
        id: 'metricZones',
        beforeDatasetsDraw: (chart) => {
          const { ctx, chartArea, scales } = chart;

          if (!chartArea || !scales.y) {
            return;
          }

          const { left, right } = chartArea;
          const y = scales.y;

          const fillZone = (from, to, color) => {
            const safeFrom = Math.max(0, from);
            const safeTo = Math.min(suggestedMax, to);

            if (safeTo <= safeFrom) {
              return;
            }

            const zoneTop = y.getPixelForValue(safeTo);
            const zoneBottom = y.getPixelForValue(safeFrom);
            ctx.save();
            ctx.fillStyle = color;
            ctx.fillRect(left, zoneTop, right - left, zoneBottom - zoneTop);
            ctx.restore();
          };

          if (Number.isFinite(good) && good < suggestedMax) {
            // fillZone(0, good, 'rgba(20, 150, 90, 0.30)');
            fillZone(0, good, 'rgba(20, 150, 90, 0.45)');
          }

          if (
            Number.isFinite(good) &&
            Number.isFinite(warning) &&
            good < suggestedMax
          ) {
            // fillZone(good, warning, 'rgba(220, 170, 20, 0.24)');
            fillZone(good, warning, 'rgba(220, 170, 20, 0.45)');
          }

          if (Number.isFinite(warning) && warning < suggestedMax) {
            // fillZone(warning, Number.isFinite(bad) ? bad : suggestedMax, 'rgba(220, 80, 80, 0.22)');
            fillZone(warning, Number.isFinite(bad) ? bad : suggestedMax, 'rgba(220, 80, 80, 0.45)');
          }
        },
      };

      const labelsPlugin = {
        id: 'metricLabels',
        afterDatasetsDraw: (chart) => {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          const baselineY = chart.scales.y.getPixelForValue(0) - 86;
          const yScale = chart.scales.y;
          const lowBarValueThreshold = Math.max(yScale.max * 0.32, 100);
          const deltaBars = meta.data.slice(1);
          const hasLowBar = deltaBars.some((bar) => {
            const value = yScale.getValueForPixel(bar.y);
            return Number.isFinite(value) && value <= lowBarValueThreshold;
          });

          meta.data.forEach((bar, index) => {
            const value = data.values[index];
            const barHeight = bar.base - bar.y;
            const topFontSize = this.getBarFontSize(bar.width, { min: 12, max: 18, ratio: 0.2 });
            const innerFontSize = this.getBarFontSize(bar.width, { min: 12, max: 18, ratio: 0.2 });

            ctx.save();
            ctx.font = `600 ${topFontSize}px 'Montserrat', sans-serif`;
            // ctx.fillStyle = '#e8eaf0';
            ctx.fillStyle = '#e8eaf0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this.formatValue(value, { withSuffix: false }), bar.x, bar.y - 6);
            ctx.restore();

            if (index > 0 && barHeight > 18) {
              const delta = data.optimizations[index - 1].delta;
              const verticalPadding = 6;
              const fittedInnerFontSize = Math.max(
                10,
                Math.min(innerFontSize, Math.floor(barHeight - verticalPadding * 2))
              );
              const minLabelY = bar.y + fittedInnerFontSize / 2 + verticalPadding;
              const maxLabelY = bar.base - fittedInnerFontSize / 2 - verticalPadding;
              const centeredLabelY = bar.y + barHeight / 2;
              const labelY = hasLowBar
                ? Math.min(maxLabelY, Math.max(minLabelY, centeredLabelY))
                : Math.min(maxLabelY, Math.max(minLabelY, baselineY));

              ctx.save();
              ctx.font = `600 ${fittedInnerFontSize}px 'Montserrat', sans-serif`;
              ctx.fillStyle = '#1a1e2a';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(
                `${this.formatDelta(delta)}`,
                bar.x,
                labelY
              );
              ctx.restore();
            }
          });
        },
      };

      const highlightPlugin = {
        id: 'metricHighlightLast',
        beforeDatasetsDraw: (chart) => {
          if (!highlightLastStep || data.values.length <= 1) {
            return;
          }

          const meta = chart.getDatasetMeta(0);
          const lastBar = meta.data[data.values.length - 1];
          const { chartArea } = chart;

          if (!lastBar || !chartArea) {
            return;
          }

          const { ctx } = chart;
          const width = lastBar.width + 12;
          const height = (lastBar.base - lastBar.y) + 12;
          const x = lastBar.x - width / 2;
          const y = lastBar.y - 6;

          ctx.save();
          ctx.beginPath();
          ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
          ctx.clip();
          ctx.shadowColor = 'rgba(91, 141, 238, 0.75)';
          ctx.shadowBlur = 28;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = 'rgba(91, 141, 238, 0.22)';
          ctx.beginPath();
          ctx.roundRect(x, y, width, height, 10);
          ctx.fill();
          ctx.restore();
        },
        afterDatasetsDraw: (chart) => {
          if (!highlightLastStep || data.values.length <= 1) {
            return;
          }

          const meta = chart.getDatasetMeta(0);
          const lastBar = meta.data[data.values.length - 1];
          const { chartArea } = chart;

          if (!lastBar || !chartArea) {
            return;
          }

          const { ctx } = chart;
          const width = lastBar.width;
          const height = lastBar.base - lastBar.y + 2;
          const x = lastBar.x - width / 2;
          const y = lastBar.y;
          const radius = 8;

          ctx.save();
          ctx.beginPath();
          ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
          ctx.clip();
          ctx.strokeStyle = '#5b8dee';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x - 2, y + height);
          ctx.lineTo(x - 2, y + radius);
          ctx.quadraticCurveTo(x - 2, y - 2, x - 2 + radius, y - 2);
          ctx.lineTo(x + width + 2 - radius, y - 2);
          ctx.quadraticCurveTo(x + width + 2, y - 2, x + width + 2, y + radius);
          ctx.lineTo(x + width + 2, y + height);
          ctx.stroke();
          ctx.restore();
        },
      };

      this.chart = new window.Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: data.values.map((_, index) => {
              const isLastOptimizationBar = highlightLastStep && index === data.values.length - 1 && index > 0;
              // return isLastOptimizationBar ? '#eef4ff' : '#b0b8c8';
              return isLastOptimizationBar ? '#e2e8f4' : '#b0b8c8';
            }),
            borderColor: data.values.map((_, index) => {
              const isLastOptimizationBar = highlightLastStep && index === data.values.length - 1 && index > 0;
              return isLastOptimizationBar ? '#5b8dee' : '#d0d8e8';
            }),
            borderWidth: data.values.map((_, index) => {
              const isLastOptimizationBar = highlightLastStep && index === data.values.length - 1 && index > 0;
              return isLastOptimizationBar ? 3 : 1;
            }),
            borderRadius: 6,
            borderSkipped: 'bottom',
            barPercentage: 0.62,
            categoryPercentage: 0.86,
          }],
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          devicePixelRatio: dpr,
          events: [],
          layout: {
            padding: {
              top: 6,
              right: 8,
              bottom: 0,
              left: 0,
            },
          },
          animation: {
            duration: 600,
            easing: 'easeOutQuart',
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
          },
          scales: {
            x: {
              alignToPixels: true,
              ticks: {
                color: '#8b92aa',
                color: '#e8eaf0',
                font: {
                  family: 'Montserrat, sans-serif',
                  size: 11,
                },
                maxRotation: 30,
                minRotation: 0,
              },
              grid: {
                display: false,
              },
              border: {
                color: 'rgba(255,255,255,0.12)',
              },
            },
            y: {
              alignToPixels: true,
              min: 0,
              suggestedMax,
              ticks: {
                // color: '#8b92aa',
                color: '#e8eaf0',
                font: {
                  family: 'Montserrat, sans-serif',
                  size: 11,
                },
                stepSize: tickStep,
                callback: (value) => String(value),
              },
              title: {
                display: true,
                text: this.getAttribute('value-suffix') || '',
                color: '#8b92aa',
                color: '#e8eaf0',
                font: {
                  family: 'Montserrat, sans-serif',
                  size: 11,
                  weight: '500',
                },
                padding: {
                  bottom: 6,
                },
              },
              grid: {
                color: 'rgba(255,255,255,0.06)',
              },
              border: {
                color: 'rgba(255,255,255,0.12)',
              },
            },
          },
        },
        plugins: [zonePlugin, highlightPlugin, labelsPlugin],
      });
    });
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

customElements.define('metric-optimization-chart', MetricOptimizationChart);
