import { useEffect, useState } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { GATEWAY_BASE, toVehicle, type GatewayVehicleResponse } from './gateway';
import type { Vehicle } from './api';

export interface StreamTarget {
  vehicleId: string | null;
  lineId: string | null;
  patternId: string | null;
}

export interface StreamConnection {
  start(): Promise<void>;
  invoke(method: string, ...args: unknown[]): Promise<unknown>;
  onreconnecting(callback: () => void): void;
  onreconnected(callback: () => void): void;
  onclose(callback: () => void): void;
}

// A reconnect is a new connection with a new id, and the server keys its groups
// by that id — so a reconnected client belongs to no group until it asks again.
// `live` only turns true once the subscription itself resolves: reporting it
// any earlier tells the caller to stop polling a stream that sends nothing.
export function openVehicleStream(
  connection: StreamConnection,
  target: StreamTarget,
  onLive: (live: boolean) => void
): Promise<void> {
  const subscribe = () =>
    (target.vehicleId
      ? connection.invoke('SubscribeToVehicle', target.vehicleId)
      : connection.invoke('SubscribeToLine', target.lineId, target.patternId)
    ).then(
      () => onLive(true),
      () => onLive(false)
    );

  connection.onreconnecting(() => onLive(false));
  connection.onreconnected(() => void subscribe());
  connection.onclose(() => onLive(false));

  return connection.start().then(subscribe, () => onLive(false));
}

// SignalR negotiates its own transport: WebSockets, then Server-Sent Events,
// then long polling. What it cannot survive is a network that blocks all three,
// or iOS suspending the connection when the phone locks — hence `connected`,
// which the caller uses to fall back to polling.
export function useVehicleStream(
  vehicleId: string | null,
  lineId?: string | null,
  patternId?: string | null
): { vehicle: Vehicle | null; connected: boolean } {
  const target = vehicleId || lineId ? `${vehicleId ?? ''}|${lineId ?? ''}|${patternId ?? ''}` : '';
  const enabled = GATEWAY_BASE.length > 0 && target !== '';

  const [received, setReceived] = useState<{ target: string; vehicle: Vehicle } | null>(null);
  const [liveTarget, setLiveTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const connection = new HubConnectionBuilder()
      .withUrl(`${GATEWAY_BASE}/hubs/vehicles`)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('vehicleUpdated', (payload: GatewayVehicleResponse) => {
      if (!cancelled) setReceived({ target, vehicle: toVehicle(payload) });
    });

    void openVehicleStream(connection, { vehicleId: vehicleId ?? null, lineId: lineId ?? null, patternId: patternId ?? null }, live => {
      if (!cancelled) setLiveTarget(live ? target : null);
    });

    return () => {
      cancelled = true;
      if (connection.state !== HubConnectionState.Disconnected) void connection.stop();
    };
  }, [enabled, target, vehicleId, lineId, patternId]);

  // Both values are derived rather than written back from the effect. Two
  // reasons: writing state inside an effect body causes a second render for
  // nothing, and a position that arrived for the previous bus must never be
  // shown as the new one — so a reading only counts while its target is still
  // the one being tracked.
  return {
    vehicle: enabled && received?.target === target ? received.vehicle : null,
    connected: enabled && liveTarget === target,
  };
}

// The last streamed position outlives the connection that delivered it, so it
// must not win once that connection is gone — otherwise the fallback poll runs
// and paints nothing.
export function freshestVehicle(
  streamed: Vehicle | null,
  connected: boolean,
  polled: Vehicle | null
): Vehicle | null {
  return connected ? streamed ?? polled : polled ?? streamed;
}
