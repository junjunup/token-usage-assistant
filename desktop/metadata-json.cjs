// A selective JSON decoder: excluded strings/objects are skipped, never decoded or retained.
// This prevents conversation text, instructions and tool results entering the usage object.
// KEYS (T18.4): an object's key names, with number values decoded and every other value skipped (null), so a reader
// can see which counters a record reports without decoding anything else in it.
const KEYS = Symbol('keys');
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
    if (sel === KEYS) {
      if (c !== '{') {
        value(false, depth);
        return undefined;
      }
      i++;
      const out = Object.create(null);
      ws();
      if (source[i] === '}') {
        i++;
        return out;
      }
      while (i < source.length) {
        ws();
        if (source[i] !== '"') throw new Error('json');
        const key = str(true);
        ws();
        if (source[i++] !== ':') throw new Error('json');
        ws();
        const numeric = /[-0-9]/.test(source[i] || '');
        const v = value(numeric, depth + 1);
        out[key] = numeric ? v : null;
        ws();
        const sep = source[i++];
        if (sep === '}') return out;
        if (sep !== ',') throw new Error('json');
      }
      throw new Error('json');
    }
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
        // An array selection [rule] applies its one rule to every element (T12.3); objects select by key.
        const child =
            sel === true
              ? true
              : obj
                ? sel && Object.hasOwn(sel, key)
                  ? sel[key]
                  : false
                : Array.isArray(sel)
                  ? sel[0]
                  : false,
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
module.exports = { projectJSON, KEYS };
