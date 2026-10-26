// Client phía UI của worker mô phỏng: gắn reqId, validate tin nhận tại ranh giới (ADR 0001).
import { parseWorkerMessage, type Command, type WorkerMessage } from '@tsvl/shared';

export type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, 'reqId'> : never) : never;

export interface SimPort {
  postMessage(m: unknown): void;
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
}

export class SimClient {
  private reqId = 0;
  private listeners = new Set<(m: WorkerMessage) => void>();

  constructor(private readonly port: SimPort) {
    port.onmessage = (e) => {
      const r = parseWorkerMessage(e.data);
      const m: WorkerMessage = r.ok ? r.value : { type: 'ERROR', reqId: null, code: 'INTERNAL', message: `tin từ worker sai hợp đồng: ${r.error}` };
      for (const l of this.listeners) l(m);
    };
  }

  static spawn(): SimClient {
    const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    return new SimClient(worker as unknown as SimPort);
  }

  subscribe(fn: (m: WorkerMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(cmd: CommandInput): number {
    const reqId = ++this.reqId;
    this.port.postMessage({ ...cmd, reqId });
    return reqId;
  }
}
