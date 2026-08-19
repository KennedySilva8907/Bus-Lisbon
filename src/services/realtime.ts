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

  return {
    vehicle: enabled && received?.target === target ? received.vehicle : null,
    connected: enabled && liveTarget === target,
  };
}

export function freshestVehicle(
  streamed: Vehicle | null,
  connected: boolean,
  polled: Vehicle | null
): Vehicle | null {
  return connected ? streamed ?? polled : polled ?? streamed;
}
