// A selective JSON decoder: excluded strings/objects are skipped, never decoded or retained.
// This prevents conversation text, instructions and tool results entering the usage object.
function projectJSON(source, selection) {
  let i = 0;
  const ws = () => {
    while (/\s/.test(source[i] || '') && i < source.length) i++;
  };
  function str(keep) {
    const start = i++;
    while (i < source.length) {
      const c = source[i++];
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '"') return keep ? JSON.parse(source.slice(start, i)) : undefined;
    }
    throw new Error('json');
  }
  function value(sel, depth = 0) {
    if (depth > 100) throw new Error('depth');
    ws();
    const c = source[i];
    if (c === '"') return str(sel === true);
    if (c === '{' || c === '[') {
      const obj = c === '{',
        end = obj ? '}' : ']',
        out = sel ? (obj ? Object.create(null) : []) : undefined;
      i++;
      ws();
      if (source[i] === end) {
        i++;
        return out;
      }
      while (i < source.length) {
        let key;
        if (obj) {
          ws();
          if (source[i] !== '"') throw new Error('json');
          key = str(!!sel);
          ws();
          if (source[i++] !== ':') throw new Error('json');
        }
        const child = sel === true ? true : obj && sel && Object.hasOwn(sel, key) ? sel[key] : false,
          v = value(child, depth + 1);
        if (child) {
          if (obj) out[key] = v;
          else out.push(v);
        }
        ws();
        const sep = source[i++];
        if (sep === end) return out;
        if (sep !== ',') throw new Error('json');
      }
      throw new Error('json');
    }
    const start = i;
    while (i < source.length && !/[\s,\]}]/.test(source[i])) i++;
    if (i === start) throw new Error('json');
    return sel === true ? JSON.parse(source.slice(start, i)) : undefined;
  }
  const result = value(selection);
  ws();
  if (i !== source.length) throw new Error('json');
  return result;
}
module.exports = { projectJSON };
