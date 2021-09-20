/*
 * @license
 * chartjs-plugin-update-only-visible
 *
 * Copyright 2020 Toni Dietze
 *
 * derived from:
 *
 * chartjs-plugin-deferred
 * http://chartjs.org/
 * Version: 1.0.1
 *
 * Copyright 2018 Simon Brunel
 * Released under the MIT license
 * https://github.com/chartjs/chartjs-plugin-deferred/blob/master/LICENSE.md
 */
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('chart.js')) :
	typeof define === 'function' && define.amd ? define(['chart.js'], factory) :
	(factory(global.Chart));
}(this, (function (Chart) { 'use strict';

Chart = Chart && Chart.hasOwnProperty('default') ? Chart['default'] : Chart;

'use strict';

var helpers = Chart.helpers;
var STUB_KEY = '$chartjs_update_only_visible';
var MODEL_KEY = '$update_only_visible';

function chartInViewport(chart) {
	var canvas = chart.canvas;

	// http://stackoverflow.com/a/21696585
	if (!canvas || canvas.offsetParent === null) {
		return false;
	}

	var rect = canvas.getBoundingClientRect();

	return rect.right  >= 0
		&& rect.bottom >= 0
		&& rect.left   <= window.innerWidth
		&& rect.top    <= window.innerHeight;
}

function onScroll(event) {
	var node = event.target;
	var stub = node[STUB_KEY];

	var charts = stub.charts.slice();
	var ilen = charts.length;
	var chart, i;

	for (i = 0; i < ilen; ++i) {
		chart = charts[i];
		if (chartInViewport(chart)) {
			chart.update();
		}
	}
}

function isScrollable(node) {
	var type = node.nodeType;
	if (type === Node.ELEMENT_NODE) {
		var overflowX = helpers.getStyle(node, 'overflow-x');
		var overflowY = helpers.getStyle(node, 'overflow-y');
		return overflowX === 'auto' || overflowX === 'scroll'
			|| overflowY === 'auto' || overflowY === 'scroll';
	}

	return node.nodeType === Node.DOCUMENT_NODE;
}

function watch(chart) {
	var canvas = chart.canvas;
	var parent = canvas.parentElement;
	var stub, charts;

	while (parent) {
		if (isScrollable(parent)) {
			stub = parent[STUB_KEY] || (parent[STUB_KEY] = {});
			charts = stub.charts || (stub.charts = []);
			if (charts.length === 0) {
				parent.addEventListener('scroll', onScroll);
			}

			charts.push(chart);
			chart[MODEL_KEY].elements.push(parent);
		}

		parent = parent.parentElement || parent.ownerDocument;
	}
}

function unwatch(chart) {
	chart[MODEL_KEY].elements.forEach(function(element) {
		var charts = element[STUB_KEY].charts;
		charts.splice(charts.indexOf(chart), 1);
		if (!charts.length) {
			element.removeEventListener('scroll', onScroll);
			delete element[STUB_KEY];
		}
	});

	chart[MODEL_KEY].elements = [];
}

Chart.register({
	id: 'update-only-visible',

	beforeInit: function(chart, options) {
		chart[MODEL_KEY] = {
			options: options,
			watching: false,
			elements: []
		};
	},

	beforeUpdate: function(chart, _options) {
		var model = chart[MODEL_KEY];
		if (chartInViewport(chart)) {
			if (model.watching) {
				model.watching = false;
				unwatch(chart);
			}
		} else {
			if (!model.watching) {
				model.watching = true;
				watch(chart);
			}
			return false;
		}
	},

	destroy: function(chart) {
		unwatch(chart);
	}
});

})));
