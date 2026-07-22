/**
 * Web stub for react-native-maps.
 * Metro resolves this file instead of the native package when platform === 'web',
 * preventing the fatal codegenNativeCommands import that kills the bundler.
 */
const React = require('react');
const { View } = require('react-native');

function MapView(props) {
  return React.createElement(View, props);
}
MapView.Animated = MapView;

function Marker(props) {
  return React.createElement(View, props);
}

function Polyline(props) {
  return React.createElement(View, props);
}

function Polygon(props) {
  return React.createElement(View, props);
}

function Circle(props) {
  return React.createElement(View, props);
}

function Callout(props) {
  return React.createElement(View, props);
}

const PROVIDER_GOOGLE = 'google';
const PROVIDER_DEFAULT = null;

module.exports = MapView;
module.exports.default = MapView;
module.exports.MapView = MapView;
module.exports.Marker = Marker;
module.exports.Polyline = Polyline;
module.exports.Polygon = Polygon;
module.exports.Circle = Circle;
module.exports.Callout = Callout;
module.exports.PROVIDER_GOOGLE = PROVIDER_GOOGLE;
module.exports.PROVIDER_DEFAULT = PROVIDER_DEFAULT;
