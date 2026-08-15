import { useEffect, useState } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { GATEWAY_BASE, toVehicle, type GatewayVehicleResponse } from './gateway';
import type { Vehicle } from './api';

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

    connection.onreconnected(() => setLiveTarget(target));
    connection.onreconnecting(() => setLiveTarget(null));
    connection.onclose(() => setLiveTarget(null));

    connection
      .start()
      .then(() =>
        vehicleId
          ? connection.invoke('SubscribeToVehicle', vehicleId)
          : connection.invoke('SubscribeToLine', lineId, patternId ?? null)
      )
      .then(() => {
        if (!cancelled) setLiveTarget(target);
      })
      .catch(() => {
        if (!cancelled) setLiveTarget(null);
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
