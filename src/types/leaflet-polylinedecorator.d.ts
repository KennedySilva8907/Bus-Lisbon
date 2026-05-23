// Minimal types for leaflet-polylinedecorator (the package ships no .d.ts).
// We only cover the surface we actually use.
import 'leaflet';

declare module 'leaflet' {
  interface ArrowHeadOptions {
    pixelSize?: number;
    headAngle?: number;
    polygon?: boolean;
    pathOptions?: L.PathOptions;
  }

  interface SymbolFactory {
    arrowHead(options: ArrowHeadOptions): unknown;
  }

  interface PolylineDecoratorPattern {
    offset?: number | string;
    endOffset?: number | string;
    repeat?: number | string;
    symbol: unknown;
  }

  interface PolylineDecoratorOptions {
    patterns: PolylineDecoratorPattern[];
  }

  function polylineDecorator(
    paths: Polyline | Polyline[],
    options: PolylineDecoratorOptions,
  ): Layer;

  const Symbol: SymbolFactory;
}
