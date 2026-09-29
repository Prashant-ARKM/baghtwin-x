/**
 * Ambient typing for the plotly.js-dist-min runtime bundle.
 * Types come from the installed @types/plotly.js package; the value import
 * below is erased at compile time, so nothing is pulled from the bundle here.
 */
declare module "plotly.js-dist-min" {
  import type * as Plotly from "plotly.js";
  export = Plotly;
}
