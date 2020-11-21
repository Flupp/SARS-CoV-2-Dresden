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
const colorsDeceased  = { dark:  'hsl(  0,   0%, 30%)'
                        , light: 'hsl(  0,   0%, 50%)' };
const colorsRecovered = { dark:  'hsl(160, 100%, 30%)'
                        , light: 'hsl(160, 100%, 50%)' };


function calcPointRadius(xMin, xMax) {
   return Math.max(1, Math.min(3,
     0.25 * window.innerWidth / ((xMax - xMin) / SAMPLE_INTERVAL)));
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


let charts = [];

function drawChart(elementId, stacked, xMin, xMax, datasets) {
  charts.push
    ( new Chart
      ( document.getElementById(elementId).getContext('2d')
      , { data: { datasets: datasets }
        , options:
          { maintainAspectRatio: false
          , responsive: true
          , scales:
            { xAxes:
              [ { stacked: stacked
                , ticks: { min: xMin, max: xMax }
                , time:
                  { displayFormats: { week: 'MMM DD' }
                  , isoWeekday: true
                  , tooltipFormat: 'YYYY-MM-DD / YYYY-[W]WW-E'
                  , unit: 'week' }
                , type: 'time' } ]
            , yAxes: [{}] }
          , tooltips:
            { itemSort: (a, b) => a.y - b.y
            , mode: 'index' }
          , // https://www.chartjs.org/docs/latest/general/performance.html
            animation: { duration: 0 }
          , hover: { animationDuration: 0 }
          , responsiveAnimationDuration: 0 } } ) );
}


function updateChartHeight(height) {
  for (const e of document.querySelectorAll('.chart-container')) {
    e.style.height = (height / 1000) + 'vh';
  }
}


function weekcoloring(data, colors) {
  return data.map(
    p => 1 <= p.x.getDay() && p.x.getDay() <= 5
       ? colors.dark : colors.light);
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
  return { backgroundColor: weekcoloring(timeSeries, colors)
         , borderWidth: 0
         , data: timeSeries
         , label: label
         , type: 'bar' };
}


function createLineDataset(label, colors, startTime, data) {
  const timeSeries = toTimeSeries(startTime, data);
  const colorSequence = weekcoloring(timeSeries, colors);
  return { backgroundColor: colorSequence
         , borderColor: colors.light
         , borderWidth: 1
         , cubicInterpolationMode: 'monotone'
         , data: timeSeries
         , fill: false
         , label: label
         , pointBorderColor: colorSequence
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

    const daily7DayIncidenceOld = data.map(o => o.Inzidenz);
    const dailyNew              = data.map(o => o.Fälle_Meldedatum);
    const dailyDeaths           = data.map(o => o.SterbeF_Meldedatum);
    const dailyRecovered        = data.map(o => o.Zuwachs_Genesung);
    const dailyHospitalized     = data.map(o => o.Hosp_Meldedatum);

    const dailyActive = [];
    let todayActive = 0;
    for (const o of data) {
      todayActive += o.Fälle_Meldedatum - o.Zuwachs_Genesung - o.SterbeF_Meldedatum;
      dailyActive.push(todayActive);
    }

    const xMin = Math.max(dayFirst, dayLast - 70 * SAMPLE_INTERVAL);
    const xMax = dayLast + 1.5 * SAMPLE_INTERVAL;
      // add more than one because last incidence is in future
    Chart.defaults.global.elements.point.radius = calcPointRadius(xMin, xMax);

    {
      const slider = document.getElementById('idxFirst');
      slider.min = dayFirst - SAMPLE_INTERVAL;
      slider.max = dayLast  - SAMPLE_INTERVAL;
      slider.value = xMin;
      slider.oninput = function () {
        const r = calcPointRadius(this.value, this.max);
        for (const chart of charts) {
          chart.options.elements.point.radius = r;
          chart.options.scales.xAxes[0].ticks.min = Number(this.value);
          chart.update();
        }
      };
    }
    window.onresize = function () {
      const slider = document.getElementById('idxFirst');
      const r = calcPointRadius(slider.value, slider.max);
      for (const chart of charts) {
        chart.options.elements.point.radius = r;
        chart.update();
      }
    };

    const daily7DayIncidence = windowSums(7, dailyNew).map(y => y * INCIDENCE_FACTOR);
    daily7DayIncidence.unshift(0);  // the 7 day incidence refers to the last 7 days *before* the current day
    drawChart
      ( 'canvas7DayIncidence'
      , false
      , xMin
      , xMax
      , [ { backgroundColor: '#000000'
          , data: toTimeSeries(dayFirst, daily7DayIncidenceOld)
          , label: 'historisch'
          , type: 'scatter' }
        , createBarDataset
            ( 'aktuell'
            , colorsNeutral
            , dayFirst
            , daily7DayIncidence ) ] );

    drawChart
      ( 'canvasCases'
      , true
      , xMin
      , xMax
      , [ createBarDataset
            ( 'neu'
            , colorsNew
            , dayFirst
            , dailyNew )
        , createBarDataset
            ( 'verstorben'
            , colorsDeceased
            , dayFirst
            , dailyDeaths.map(y => -y) )
        , createBarDataset
            ( 'genesen'
            , colorsRecovered
            , dayFirst
            , dailyRecovered.map(y => -y) ) ] );

    drawChart
      ( 'canvasActive'
      , false
      , xMin
      , xMax
      , [ createBarDataset
            ( 'aktiv'
            , colorsNeutral
            , dayFirst
            , dailyActive ) ] );

    drawChart
      ( 'canvasHospitalized'
      , false
      , xMin
      , xMax
      , [ createBarDataset
            ( 'hospitalisiert'
            , colorsNeutral
            , dayFirst
            , dailyHospitalized ) ] );

    drawChart
      ( 'canvasInHospital'
      , false
      , xMin
      , xMax
      , [ createLineDataset
            ( '14 Tage'
            , colorsRecovered
            , dayFirst
            , windowSums(14, dailyHospitalized) )
        , createLineDataset
            ( '20 Tage'
            , colorsNew
            , dayFirst
            , windowSums(20, dailyHospitalized) ) ] );

  };
};
