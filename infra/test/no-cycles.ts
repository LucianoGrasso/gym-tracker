type Node = Record<string, unknown>;

function refsOf(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => refsOf(v, out));
  else if (value && typeof value === 'object') {
    const obj = value as Node;
    if (typeof obj.Ref === 'string') out.add(obj.Ref);
    const getAtt = obj['Fn::GetAtt'];
    if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') out.add(getAtt[0]);
    Object.values(obj).forEach((v) => refsOf(v, out));
  }
  return out;
}

/** Devuelve un ciclo de dependencias entre recursos, o null si no hay (CloudFormation solo lo detecta al desplegar). */
export function findCycle(template: { [key: string]: any }): string[] | null {
  const resources = template.Resources as Record<string, Node>;
  const ids = Object.keys(resources);
  const deps = new Map(
    ids.map((id) => {
      const res = resources[id];
      const set = refsOf(res.Properties ?? {}, new Set());
      const dependsOn = res.DependsOn;
      (Array.isArray(dependsOn) ? dependsOn : dependsOn ? [dependsOn] : []).forEach((d) => set.add(d as string));
      return [id, [...set].filter((d) => d in resources)];
    }),
  );
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}
