// Dây nối Worker ↔ SimHost (ADR 0006). Không có luật game ở đây; validate lệnh nằm trong SimHost.
import { SimHost } from '@tsvl/sim';

const scope = self as unknown as Worker;
const host = new SimHost((m) => scope.postMessage(m));
scope.onmessage = (e: MessageEvent<unknown>) => host.handle(e.data);
host.ready();
