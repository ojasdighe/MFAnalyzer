// static/script.js

// Global state management
const state = {
    historicalData: null,
    currentMetrics: null,
    additionalCashflows: [],
    charts: {},
    selectedPeriod: '12' // Default to 1 year
};

// Chart configurations
const chartConfigs = {
    historical: {
        title: 'Historical NAV Trend',
        yaxis: { title: 'NAV Value' }
    },
    absoluteReturns: {
        title: 'Absolute Returns Over Time',
        yaxis: { title: 'Returns (%)' }
    },
    rollingReturns: {
        title: 'Rolling Returns Distribution',
        yaxis: { title: 'Returns (%)' }
    },
    cagr: {
        title: 'CAGR Analysis',
        yaxis: { title: 'CAGR (%)' }
    },
    xirr: {
        title: 'XIRR Trend',
        yaxis: { title: 'XIRR (%)' }
    },
    sharpeRatio: {
        title: 'Risk-Adjusted Returns',
        yaxis: { title: 'Sharpe Ratio' }
    }
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApplication();
});

async function initializeApplication() {
    initializeDateRanges();
    initializeCharts();
    attachEventListeners();
    await loadInitialData();
    updateUIState();
}

function initializeDateRanges() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;
}

function initializeCharts() {
    // Initialize all charts with default configurations
    state.charts = {
        historical: initializeChart('historical-chart', chartConfigs.historical),
        absoluteReturns: initializeChart('absolute-returns-chart', chartConfigs.absoluteReturns),
        rollingReturns: initializeChart('rolling-returns-chart', chartConfigs.rollingReturns),
        cagr: initializeChart('cagr-chart', chartConfigs.cagr),
        xirr: initializeChart('xirr-chart', chartConfigs.xirr),
        sharpeRatio: initializeChart('sharpe-ratio-chart', chartConfigs.sharpeRatio),
        navTrend: initializeChart('nav-trend-chart', { title: 'NAV Trend Analysis' }),
        returnsDistribution: initializeChart('returns-distribution-chart', { title: 'Returns Distribution' }),
        riskMetrics: initializeChart('risk-metrics-chart', { title: 'Risk Metrics Over Time' })
    };
}

function initializeChart(elementId, config) {
    const defaultLayout = {
        autosize: true,
        margin: { t: 40, r: 20, b: 40, l: 60 },
        showlegend: true,
        hovermode: 'closest',
        plot_bgcolor: '#fff',
        paper_bgcolor: '#fff',
        ...config
    };

    Plotly.newPlot(elementId, [{
        type: 'scatter',
        mode: 'lines',
        name: config.title
    }], defaultLayout);

    return document.getElementById(elementId);
}

function attachEventListeners() {
    // Period selection buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => updatePeriod(btn.dataset.period));
    });

    // Form controls
    const formControls = ['startDate', 'endDate', 'rollingWindow', 'cagrPeriod', 'sharpePeriod'];
    formControls.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                validateInputs();
                if (!hasValidationErrors()) {
                    analyzeFund();
                }
            });
        }
    });

    // Cashflow buttons
    document.querySelector('.btn-secondary').addEventListener('click', addCashflow);
}

async function loadInitialData() {
    showLoading();
    try {
        const response = await fetch('/fund-data.json');
        const fundInfo = await response.json();
        updateFundInfo(fundInfo);
        await analyzeFund();
    } catch (error) {
        showError('Failed to load initial fund data');
        console.error('Error loading initial data:', error);
    } finally {
        hideLoading();
    }
}

async function analyzeFund() {
    showLoading();
    
    try {
        const analysisParams = getAnalysisParameters();
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(analysisParams)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        updateAnalysisResults(data);
    } catch (error) {
        showError('Analysis failed. Please try again.');
        console.error('Analysis error:', error);
    } finally {
        hideLoading();
    }
}

function updateAnalysisResults(data) {
    state.historicalData = data.historical_data;
    state.currentMetrics = data.metrics;

    updateMetricsDisplay(data.metrics);
    updateCharts(data.historical_data);
    updateRecommendation(data.recommendation);
    updateComparativeAnalysis(data.comparative);
    updateHistoricalTrends(data.trends);

    showAnalysisResults();
}

function updateMetricsDisplay(metrics) {
    Object.entries(metrics).forEach(([metric, value]) => {
        const element = document.getElementById(metric);
        if (element) {
            element.textContent = formatMetricValue(metric, value);
            updateMetricChart(metric, value);
        }
    });
}

function updateCharts(historicalData) {
    // Update historical NAV chart
    const traces = Object.entries(historicalData).map(([period, data]) => ({
        x: data.dates,
        y: data.values,
        name: `${period} Month`,
        type: 'scatter',
        mode: 'lines'
    }));

    Plotly.react(state.charts.historical, traces, {
        ...chartConfigs.historical,
        xaxis: { title: 'Date', rangeslider: {} }
    });

    // Update other metric charts
    updateMetricSpecificCharts(historicalData);
}

function updateMetricSpecificCharts(historicalData) {
    // Update each metric's chart with its specific data visualization
    Object.entries(state.charts).forEach(([chartKey, chartElement]) => {
        if (chartKey !== 'historical') {
            const chartData = prepareChartData(chartKey, historicalData);
            Plotly.react(chartElement, chartData.traces, chartData.layout);
        }
    });
}

function prepareChartData(chartKey, historicalData) {
    // Prepare specific chart data based on chart type
    switch (chartKey) {
        case 'absoluteReturns':
            return prepareAbsoluteReturnsChart(historicalData);
        case 'rollingReturns':
            return prepareRollingReturnsChart(historicalData);
        case 'cagr':
            return prepareCAGRChart(historicalData);
        // Add cases for other charts
        default:
            return {
                traces: [],
                layout: chartConfigs[chartKey] || {}
            };
    }
}

function updateRecommendation(recommendation) {
    const decisionElement = document.getElementById('recommendation-decision');
    const scoreElement = document.getElementById('score-value');
    const reasonsList = document.getElementById('analysis-reasons');
    const actionsList = document.getElementById('action-items');

    // Update decision
    decisionElement.textContent = recommendation.recommendation;
    decisionElement.className = `decision-box ${recommendation.recommendation.toLowerCase().replace(/\s+/g, '-')}`;

    // Update score
    scoreElement.textContent = `${recommendation.score}/10`;

    // Update reasons
    reasonsList.innerHTML = recommendation.reasons
        .map(reason => `<li>${reason}</li>`)
        .join('');

    // Update action items
    actionsList.innerHTML = recommendation.action_items
        .map(action => `<li>${action}</li>`)
        .join('');
}

function updateComparativeAnalysis(comparative) {
    if (!comparative) return;

    const categoryComparison = document.getElementById('category-comparison');
    const benchmarkComparison = document.getElementById('benchmark-comparison');

    if (categoryComparison && benchmarkComparison) {
        // Update comparison displays
        categoryComparison.innerHTML = formatComparison(comparative.category);
        benchmarkComparison.innerHTML = formatComparison(comparative.benchmark);
    }
}

function updateHistoricalTrends(trends) {
    if (!trends) return;

    updateTrendChart('nav-trend-chart', trends.nav);
    updateTrendChart('returns-distribution-chart', trends.returns);
    updateTrendChart('risk-metrics-chart', trends.risk);
}

// Utility Functions
function formatMetricValue(metric, value) {
    if (value === null || value === undefined) return 'N/A';
    
    switch (metric) {
        case 'sharpe_ratio':
            return value.toFixed(2);
        case 'absolute_returns':
        case 'rolling_returns':
        case 'cagr':
        case 'xirr':
            return `${value.toFixed(2)}%`;
        default:
            return value.toString();
    }
}

function showLoading() {
    document.querySelector('.loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.querySelector('.loading-overlay').classList.add('hidden');
}

function showError(message) {
    // Implement a more sophisticated error display
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function validateInputs() {
    const startDate = new Date(document.getElementById('startDate').value);
    const endDate = new Date(document.getElementById('endDate').value);
    const rollingWindow = parseInt(document.getElementById('rollingWindow').value);
    const cagrPeriod = parseInt(document.getElementById('cagrPeriod').value);
    const sharpePeriod = parseInt(document.getElementById('sharpePeriod').value);

    let isValid = true;
    const errors = [];

    if (startDate >= endDate) {
        errors.push('Start date must be before end date');
        isValid = false;
    }

    if (rollingWindow < 1 || rollingWindow > 60) {
        errors.push('Rolling window must be between 1 and 60 months');
        isValid = false;
    }

    if (cagrPeriod < 1 || cagrPeriod > 10) {
        errors.push('CAGR period must be between 1 and 10 years');
        isValid = false;
    }

    if (sharpePeriod < 1 || sharpePeriod > 10) {
        errors.push('Sharpe ratio period must be between 1 and 10 years');
        isValid = false;
    }

    if (!isValid) {
        showError(errors.join('\n'));
    }

    return isValid;
}

function getAnalysisParameters() {
    return {
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        rollingWindow: parseInt(document.getElementById('rollingWindow').value),
        cagrPeriod: parseInt(document.getElementById('cagrPeriod').value),
        sharpePeriod: parseInt(document.getElementById('sharpePeriod').value),
        additionalFlows: state.additionalCashflows
    };
}

function addCashflow() {
    const cashflowsContainer = document.getElementById('cashflow-entries');
    const template = document.getElementById('cashflow-entry-template');
    const newEntry = template.content.cloneNode(true);
    
    cashflowsContainer.appendChild(newEntry);
    updateCashflowState();
}

function removeCashflow(button) {
    button.closest('.cashflow-entry').remove();
    updateCashflowState();
}

function updateCashflowState() {
    const entries = document.querySelectorAll('.cashflow-entry');
    state.additionalCashflows = Array.from(entries).map(entry => ({
        date: entry.querySelector('.cashflow-date').value,
        amount: parseFloat(entry.querySelector('.cashflow-amount').value) * 
               (entry.querySelector('.cashflow-type').value === 'withdraw' ? -1 : 1)
    })).filter(flow => flow.date && !isNaN(flow.amount));
}

function showAnalysisResults() {
    document.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
}

function updatePeriod(period) {
    state.selectedPeriod = period;
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    analyzeFund();
}

function updateFundInfo(fundInfo) {
    document.getElementById('fund-name').textContent = fundInfo.scheme_name;
    document.getElementById('fund-details').textContent = 
        `${fundInfo.amc_name} | ISIN: ${fundInfo.isin}`;
}

// Export necessary functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validateInputs,
        formatMetricValue,
        getAnalysisParameters
    };
}
