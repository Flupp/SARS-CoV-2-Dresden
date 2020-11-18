// -*- js-chain-indent: t; js-indent-level: 2; -*-
// kate: indent-width 2; replace-tabs true;
'use strict';

const POPULATION_SIZE = 556780;
const INCIDENCE_FACTOR = 100000 / POPULATION_SIZE;

const colorsNeutral   = { dark:  'hsl(190, 100%, 35%)'
                        , light: 'hsl(190, 100%, 55%)' };
const colorsNew       = { dark:  'hsl(  0, 100%, 45%)'
                        , light: 'hsl(  0, 100%, 65%)' };
const colorsDeceased  = { dark:  'hsl(  0,   0%, 30%)'
                        , light: 'hsl(  0,   0%, 50%)' };
const colorsRecovered = { dark:  'hsl(160, 100%, 30%)'
                        , light: 'hsl(160, 100%, 50%)' };


function dateAddDays(date, days) {
  const ret = new Date(date.valueOf());
  ret.setDate(ret.getDate() + days);
  return ret;
}


function windowFold(data, windowSize, shift = 0, factor = 1) {
  const ret = [];
  for (const d of data) {
    const hi = d.x;
    const lo = dateAddDays(hi, -windowSize);
    ret.push
      ( { x: shift == 0 ? hi : dateAddDays(hi, shift)
        , y: factor * data.filter(p => lo < p.x && p.x <= hi)
                          .reduce((s, p) => s + p.y, 0) } );
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
                  { tooltipFormat: 'YYYY-MM-DD / YYYY-[W]WW-E'
                  , unit: 'week' }
                , type: 'time' } ]
            , yAxes: [{}] }
          , tooltips:
            { itemSort: (a, b) => a.y - b.y
            , mode: 'x' }
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


function updateRange(min) {
  for (const chart of charts) {
    chart.options.scales.xAxes[0].ticks.min = dateAddDays(min, -1);
    chart.update();
  }
}


function weekcoloring(data, colors) {
  return data.map(
    p => 1 <= p.x.getDay() && p.x.getDay() <= 5
       ? colors.dark : colors.light);
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
    data.sort((a, b) => a.Datum_neu - b.Datum_neu);

    let todayActive = 0;
    const dates = [];
    const dailyNew = [];
    const dailyDeaths = [];
    const dailyRecovered = [];
    const dailyHospitalized = [];
    const dailyActive = [];
    const daily7DayIncidenceOld = [];
    for (const o of data) {
      const today = new Date(o.Datum_neu);
      dates.push(today);
      function pushNonNull(array, y) {
        if (y !== null) {
          array.push({x: today, y: y});
        }
      }
      const todayNew       = o.Fälle_Meldedatum;
      const todayDeceased  = o.SterbeF_Meldedatum;
      const todayRecovered = o.Zuwachs_Genesung;
      todayActive += todayNew - todayRecovered - todayDeceased;
      pushNonNull(dailyNew             , todayNew);
      pushNonNull(dailyDeaths          , todayDeceased);
      pushNonNull(dailyRecovered       , todayRecovered);
      pushNonNull(dailyActive          , todayActive);
      pushNonNull(dailyHospitalized    , o.Hosp_Meldedatum);
      pushNonNull(daily7DayIncidenceOld, o.Inzidenz);
    }

    const sliderIdxFirst = document.getElementById("idxFirst");
    sliderIdxFirst.max = dates.length - 1;
    sliderIdxFirst.value = Math.max(0, dates.length - 70);
    sliderIdxFirst.oninput = function () { updateRange(dates[this.value]); };

    const xMin = dateAddDays(dates[sliderIdxFirst.value], -1);
    const xMax = dateAddDays(dates[dates.length - 1], 2);
      // add more than one because last incidence is in future

    const daily7DayIncidence = windowFold(dailyNew, 7, 1, INCIDENCE_FACTOR);
    drawChart
      ( 'canvas7DayIncidence'
      , false
      , xMin
      , xMax
      , [ { backgroundColor: '#000000'
          , data: daily7DayIncidenceOld
          , label: 'historisch'
          , type: 'scatter' }
        , { backgroundColor: weekcoloring(daily7DayIncidence, colorsNeutral)
          , borderWidth: 0
          , data: daily7DayIncidence
          , label: 'aktuell'
          , type: 'bar' } ] );

    drawChart
      ( 'canvasCases'
      , true
      , xMin
      , xMax
      , [ { backgroundColor: weekcoloring(dailyNew, colorsNew)
          , borderWidth: 0
          , data: dailyNew
          , label: 'neu'
          , type: 'bar' }
        , { backgroundColor: weekcoloring(dailyDeaths, colorsDeceased)
          , borderWidth: 0
          , data: dailyDeaths.map(function (p) { return {x: p.x, y: -p.y}; })
          , label: 'verstorben'
          , type: 'bar' }
        , { backgroundColor: weekcoloring(dailyRecovered, colorsRecovered)
          , borderWidth: 0
          , data: dailyRecovered.map(function (p) { return {x: p.x, y: -p.y}; })
          , label: 'genesen'
          , type: 'bar' } ] );

    drawChart
      ( 'canvasActive'
      , false
      , xMin
      , xMax
      , [ { backgroundColor: weekcoloring(dailyActive, colorsNeutral)
          , borderWidth: 0
          , data: dailyActive
          , label: 'aktiv'
          , type: 'bar' } ] );

    drawChart
      ( 'canvasHospitalized'
      , false
      , xMin
      , xMax
      , [ { backgroundColor: weekcoloring(dailyHospitalized, colorsNeutral)
          , borderWidth: 0
          , data: dailyHospitalized
          , label: 'Krankenhauseinweisungen'
          , type: 'bar' } ] );

    const dailyInHospital14 = windowFold(dailyHospitalized, 14);
    const dailyInHospital20 = windowFold(dailyHospitalized, 20);
    drawChart
      ( 'canvasInHospital'
      , false
      , xMin
      , xMax
      , [ { backgroundColor: weekcoloring(dailyInHospital14, colorsRecovered)
          , borderColor: colorsRecovered.dark
          , borderWidth: 0
          , data: dailyInHospital14
          , fill: false
          , label: '14 Tage'
          , type: 'line' }
        , { backgroundColor: weekcoloring(dailyInHospital20, colorsNew)
          , borderColor: colorsNew.dark
          , borderWidth: 0
          , data: dailyInHospital20
          , fill: false
          , label: '20 Tage'
          , type: 'line' } ] );

  };
};
