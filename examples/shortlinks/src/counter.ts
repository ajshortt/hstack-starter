import { DurableObject } from "cloudflare:workers";

export class LinkCounter extends DurableObject<Env> {
  increment(): number {
    const next = this.count() + 1;
    this.ctx.storage.kv.put("clicks", next);
    return next;
  }

  count(): number {
    return this.ctx.storage.kv.get<number>("clicks") ?? 0;
  }
}
