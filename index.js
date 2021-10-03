// -*- js-chain-indent: t; js-indent-level: 2; -*-
// kate: indent-width 2; replace-tabs true;
'use strict';

const POPULATION_SIZE = 556780;
const INCIDENCE_FACTOR = 100000 / POPULATION_SIZE;

const SAMPLE_INTERVAL = 86400000;  // 1 day

const colorsNeutral   = { dark:  'hsl(190, 100%, 35%)'
                        , light: 'hsl(190, 100%, 55%)' };
const colorsNew       = { dark:  'hsl(  0, 100%, 45%)'
                        , light: 'hsl(  0, 100%, 65%)' };
const colorsDeceased  = { dark:  'hsl(  0,   0%,  0%)'
                        , light: 'hsl(  0,   0%, 50%)' };
const colorsRecovered = { dark:  'hsl(160, 100%, 30%)'
                        , light: 'hsl(160, 100%, 50%)' };

Chart.defaults.animation = false;
Chart.defaults.borderColor = '#CCCCCC';
Chart.defaults.elements.bar.pointStyle = 'rect';
Chart.defaults.elements.line.borderWidth = 1;
Chart.defaults.elements.line.cubicInterpolationMode = 'monotone';
Chart.defaults.elements.point.borderWidth = 0;
Chart.defaults.elements.point.hoverBorderWidth = 0;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.tooltip.itemSort = (a, b) => b.parsed.y - a.parsed.y;
Chart.defaults.plugins.tooltip.mode = 'index';
Chart.defaults.plugins.legend.labels.usePointStyle = true;

luxon.Settings.defaultZone = 'utc';
luxon.Settings.defaultLocale = 'de';


// Returns the largest number in {n ⋅ interval + offset | n ∈ ℤ} that is less
// than or equal to x.
function intervalFloor(interval, offset, x) {
  return Math.floor((x - offset) / interval) * interval + offset;
}

// plugin for drawing a gray backround behind weekends
const shadeWeekends = {
  id: 'shadeWeekends',
  beforeDraw(chart /* , args, options */) {
    const interval = 7   * 24 * 3600 * 1000;  // 1 week
    const offsetLo = 1.5 * 24 * 3600 * 1000;  // Fri, 02 Jan 1970 12:00:00 GMT
    const offsetHi = 3.5 * 24 * 3600 * 1000;  // Sun, 04 Jan 1970 12:00:00 GMT

    const {ctx, chartArea: {left, right, top, bottom}, scales: {x}} = chart;
    const min = x.getValueForPixel(left);
    const max = x.getValueForPixel(right);

    let lower = intervalFloor(interval, offsetLo, min);
    let upper = lower + (offsetHi - offsetLo);
    if (upper <= min) {
      lower += interval;
      if (lower >= max) {
        return;
      }
      upper = lower + (offsetHi - offsetLo);
    } else if (lower < min) {
      lower = min;
    }
    if (upper > max) {
      upper = max;
    }

    function fillLowerToUpper() {
      const x1 = x.getPixelForValue(lower);
      const x2 = x.getPixelForValue(upper);
      ctx.fillRect(x1, top, x2 - x1, bottom - top);
    }

    ctx.save();
    ctx.fillStyle = '#EEEEEE';
    fillLowerToUpper();

    lower = intervalFloor(interval, offsetLo, lower + interval);
    while (lower < max) {
        upper = lower + (offsetHi - offsetLo);
        if (upper > max) {
            upper = max;
        }
        fillLowerToUpper();
        lower += interval;
    }
    ctx.restore();
  }
};


function figureSpaceFill(x) {
  return ' '.repeat  // U+2007 FIGURE SPACE
         ( Math.max
           ( 0
           , Math.ceil
             ( 3
               - ( Math.abs(x) < 10
                 ? 0
                 : Math.log10(Math.abs(x))
         ) ) )   )
       + x.toString();
}


function tooltipCallbackLabelRounded(context) {
  return figureSpaceFill(context.parsed.y.toFixed(1));
}


// Note: negative values are rendered without sign
function tooltipCallbackLabelWithInzidence(context) {
  const y = Math.abs(context.parsed.y);
  return figureSpaceFill(y)
       +  ' '  // U+2002 EN SPACE
       +  figureSpaceFill((INCIDENCE_FACTOR * y).toFixed(1))
       +  ' / 100 000 EW';
}


function updateDefaultPointRadius(xMin, xMax) {
   const r = Math.max(2, Math.min(4,
     0.25 * window.innerWidth / ((xMax - xMin) / SAMPLE_INTERVAL)));
    Chart.defaults.elements.point.pointHoverRadius = 1.3333333333333333 * r;
    Chart.defaults.elements.point.pointRadius = r;
}


// Note: The first windows are only partially filled, i.e., zeros are
//       assumed before the first data entry.  For example:
//
//       windowSums(3, [1, 2, 3, 4])
//         == [1,  1 + 2,  1 + 2 + 3,  2 + 3 + 4]
//
// Note: If there are rounding errors in a window, this implementation
//       propagates these errors to subsequent windows.
//
function windowSums(windowSize, data) {
  windowSize = Math.min(windowSize, data.length);
  const ret = [];
  let sum = 0;
  for (let i = 0; i < windowSize; ++i) {
    sum += data[i];
    ret.push(sum);
  }
  for (let i = windowSize; i < data.length; ++i) {
    sum -= data[i - windowSize];
    sum += data[i];
    ret.push(sum);
  }
  return ret;
}


function updateChartHeight(height) {
  for (const e of document.querySelectorAll('.chart-container')) {
    e.style.height = (height / 1000) + 'vh';
  }
}




function toTimeSeries(startTime, data) {
  const ret = [];
  for (const d of data) {
    ret.push({x: new Date(startTime), y: d});
    startTime += SAMPLE_INTERVAL;
  }
  return ret;
}


function createBarDataset(label, colors, startTime, data) {
  const timeSeries = toTimeSeries(startTime, data);
  return { backgroundColor: colors.dark
         , data: timeSeries
         , label: label
         , type: 'bar' };
}


function createLineDataset(label, colors, startTime, data) {
  const timeSeries = toTimeSeries(startTime, data);
  return { backgroundColor: colors.dark
         , borderColor: colors.light
         , data: timeSeries
         , label: label
         , type: 'line' };
}


window.onload = function() {
  {
    const slider = document.getElementById('chartHeight');
    updateChartHeight(slider.value);
    slider.oninput = function () { updateChartHeight(this.value); };
  }

  const requestURL = 'https://services.arcgis.com/ORpvigFPJUhb8RDF/arcgis/rest/services/corona_DD_7_Sicht/FeatureServer/0/query?f=json&where=Datum_neu+IS+NOT+NULL&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=*&resultOffset=0&resultRecordCount=32000&resultType=standard&cacheHint=true';

  const request = new XMLHttpRequest();
  request.open('GET', requestURL);
  request.responseType = 'json';
  request.send();
  request.onload = function() {
    const data = request.response.features.map(o => o.attributes);
    for (let i = 1; i < data.length; ++i) {
      const d1 = data[i - 1].Datum_neu;
      const d2 = data[i].Datum_neu;
      const diff = d2 - d1;
      if (diff != SAMPLE_INTERVAL) {
        console.warn(`Unexpected difference to previous date at index ${i}: ${d2} - ${d1} == ${diff} != ${SAMPLE_INTERVAL}`);
        window.alert('Die geladenen Daten entsprechen nicht dem erwarteten Format. Einige Diagramme sind wahrscheinlich fehlerhaft.');
        break;
      }
    }

    const dayFirst = data[0].Datum_neu;
    const dayLast  = data[data.length - 1].Datum_neu;

    const daily7DayIncidenceRKI = data.map(o => o.Inzidenz_RKI);
    const dailyNew              = data.map(o => o.Fälle_Meldedatum);
    const dailyDeaths           = data.map(o => o.SterbeF_Sterbedatum);
    const dailyRecovered        = data.map(o => o.Zuwachs_Genesung);
    const dailyHospitalized     = data.map(o => o.Hosp_Meldedatum);

    const accumNew = [];
    let sum = 0;
    for (const n of dailyNew) {
      sum += n;
      accumNew.push(sum);
    }

    const dailyActive = [];
    let todayActive = 0;
    for (const o of data) {
      todayActive += o.Fälle_Meldedatum - o.Zuwachs_Genesung - o.SterbeF_Sterbedatum;
      dailyActive.push(todayActive);
    }

    const charts = [];
    const xMin = Math.max(dayFirst, dayLast - 70 * SAMPLE_INTERVAL);
    const xMax = dayLast + 1.5 * SAMPLE_INTERVAL;
      // add more than one because last incidence is in future
    updateDefaultPointRadius(xMin, xMax);

    {
      const slider = document.getElementById('idxFirst');
      slider.min = -(dayLast  - SAMPLE_INTERVAL);
      slider.max = -(dayFirst - SAMPLE_INTERVAL);
      slider.value = -xMin;
      slider.oninput = function () {
        updateDefaultPointRadius(-this.value, xMax);
        for (const chart of charts) {
          chart.options.scales.x.min = Number(-this.value);
          chart.update();
        }
      };
    }
    window.onresize = function () {
      const slider = document.getElementById('idxFirst');
      updateDefaultPointRadius(-slider.value, xMax);
      for (const chart of charts) {
        chart.update();
      }
    };

    const timeScale
      = { displayFormats: { week: 'd. MMM', month: 'MMM' }
        , isoWeekday: true
        , tooltipFormat: "kkkk-LL-dd / kkkk-'W'WW-c"
        , minUnit: 'month' };
    const scaleX
      = { grid: { drawOnChartArea: false, offset: false }
        , min: xMin
        , max: xMax
        , offset: false
        , time: timeScale
        , type: 'time' };

    const daily7DayIncidence = windowSums(7, dailyNew).map(y => y * INCIDENCE_FACTOR);
    daily7DayIncidence.unshift(0);  // the 7 day incidence refers to the last 7 days *before* the current day
    charts.push
      ( new Chart
        ( document.getElementById('canvas7DayIncidence').getContext('2d')
        , { data:
            { datasets:
              [ { backgroundColor: '#003F97'
                , data: toTimeSeries(dayFirst, daily7DayIncidenceRKI)
                , label: 'RKI'
                , type: 'scatter' }
              , createBarDataset ( 'aktuell'
                                 , colorsNeutral
                                 , dayFirst
                                 , daily7DayIncidence )
              , { backgroundColor: '#84170e'
                , borderColor: '#84170e'
                , label: 'IfSG'
                , pointHoverRadius: 0
                , pointRadius: 0
                , data: [ { x: 0, y: 100 }, { x: xMax + SAMPLE_INTERVAL, y: 100 }
                        , { x: xMax + SAMPLE_INTERVAL, y: 150 }, { x: 0, y: 150 }
                        , { x: 0, y: 165 }, { x: xMax + SAMPLE_INTERVAL, y: 165 } ]
                , type: 'line' } ] }
          , options:
            { scales: { x: scaleX }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelRounded } } } }
          , plugins: [shadeWeekends] } ) );

    charts.push
      ( new Chart
        ( document.getElementById('canvasCases').getContext('2d')
        , { data:
            { datasets:
              [ createBarDataset ( 'neu'
                                 , colorsNew
                                 , dayFirst
                                 , dailyNew )
              , createBarDataset ( 'verstorben'
                                 , colorsDeceased
                                 , dayFirst
                                 , dailyDeaths.map(y => -y) )
              , createBarDataset ( 'genesen'
                                 , colorsRecovered
                                 , dayFirst
                                 , dailyRecovered.map(y => -y) ) ] }
          , options:
            { scales: { x: { grid: { drawOnChartArea: false, offset: false }
                           , min: xMin
                           , max: xMax
                           , offset: false
                           , stacked: true
                           , time: timeScale
                           , type: 'time' }
                      , y: { stacked: true, ticks: { precision: 0 } } }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelWithInzidence } } } }
          , plugins: [shadeWeekends] } ) );

    charts.push
      ( new Chart
        ( document.getElementById('canvasActive').getContext('2d')
        , { data: { datasets: [ createLineDataset ( 'aktiv'
                                                  , colorsNeutral
                                                  , dayFirst
                                                  , dailyActive ) ] }
          , options:
            { scales: { x: scaleX, y: { ticks: { precision: 0 } } }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelWithInzidence } } } }
          , plugins: [shadeWeekends] } ) );

    charts.push
      ( new Chart
        ( document.getElementById('canvasHospitalized').getContext('2d')
        , { data:
            { datasets:
              [ createBarDataset ( 'hospitalisiert'
                                 , colorsNeutral
                                 , dayFirst
                                 , dailyHospitalized ) ] }
          , options:
            { scales: { x: scaleX, y: { ticks: { precision: 0 } } }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelWithInzidence } } } }
          , plugins: [shadeWeekends] } ) );

    charts.push
      ( new Chart
        ( document.getElementById('canvasInHospital').getContext('2d')
        , { data:
            { datasets:
              [ createLineDataset ( '14 Tage'
                                  , colorsRecovered
                                  , dayFirst
                                  , windowSums(14, dailyHospitalized) )
              , createLineDataset ( '20 Tage'
                                  , colorsNew
                                  , dayFirst
                                  , windowSums(20, dailyHospitalized) ) ] }
          , options:
            { scales: { x: scaleX, y: { min: 0, ticks: { precision: 0 } } }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelWithInzidence } } } }
          , plugins: [shadeWeekends] } ) );

    const chartPrevalence
      = new Chart
        ( document.getElementById('canvasPrevalence').getContext('2d')
        , { data:
            { datasets: [ ] }
          , options:
            { scales: { x: scaleX
                      , y: { min: 0
                           , ticks:
                             { callback:
                                 function(value, index, values) {  // eslint-disable-line no-unused-vars
                                   return value + ' %'; } } } }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelRounded } } } }
          , plugins: [shadeWeekends] } );
    charts.push(chartPrevalence);

    const updateChartPrevalence = function() {
      const detectionRate = 0.01 * Number(document.getElementById('inputPrevalenceDetectionRate').value);
      chartPrevalence.data.datasets
        = [ createLineDataset ( 'Durchseuchung'
                              , colorsNeutral
                              , dayFirst
                              , accumNew.map(n => 100 * n / POPULATION_SIZE / detectionRate) ) ];
      chartPrevalence.update();
    };
    updateChartPrevalence();
    document.getElementById('inputPrevalenceDetectionRate').oninput
      = updateChartPrevalence;

    const probabilityChart
      = new Chart
        ( document.getElementById('canvasProbability').getContext('2d')
        , { data: { datasets: [ ] }
          , options:
            { scales: { x: scaleX
                      , y: { min: 0
                           , ticks:
                             { callback:
                                 function(value, index, values) {  // eslint-disable-line no-unused-vars
                                   return value + ' %';
                                 } } } }
            , plugins:
              { tooltip:
                { callbacks: { label: tooltipCallbackLabelRounded } } } }
          , plugins: [shadeWeekends] } );
    charts.push(probabilityChart);

    const updateProbabilityChart = function() {
      const detectionRate = 0.01 * Number(document.getElementById('inputProbabilityDetectionRate').value);
      const windowSize = Number(document.getElementById('inputProbabilityInfectiousDays').value);
      const groupSize = Number(document.getElementById('inputProbabilityGroupSize').value);

      const infectious = windowSums(windowSize, windowSums(7, dailyNew).map(x => x / 7));

      const dailyProbability = [];
      for (let i = 0; i < infectious.length; ++i) {
        const denom = POPULATION_SIZE - (i < windowSize ? 0 : dailyActive[i - windowSize]);
        const num = Math.max(0, denom - infectious[i] / detectionRate);
        dailyProbability.push(100 * (1 - Math.pow(num / denom, groupSize)));
      }
      probabilityChart.data.datasets
        = [ createLineDataset ( 'Kontaktrisiko'
                              , colorsNeutral
                              , dayFirst - SAMPLE_INTERVAL * windowSize
                              , dailyProbability ) ];
      probabilityChart.update();
    };
    updateProbabilityChart();
    document.getElementById('inputProbabilityDetectionRate').oninput
      = updateProbabilityChart;
    document.getElementById('inputProbabilityInfectiousDays').oninput
      = updateProbabilityChart;
    document.getElementById('inputProbabilityGroupSize').oninput
      = updateProbabilityChart;
  };
};
