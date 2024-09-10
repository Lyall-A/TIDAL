function objectDefaults(obj, def) {
    if (!obj instanceof Object) return def;

    return (function checkEntries(object = obj, defaultObj = def) {
        Object.entries(defaultObj).forEach(([key, value]) => {
            if (object[key] === undefined) object[key] = value;
            else if (value instanceof Object && object[key] instanceof Object) checkEntries(object[key], value);
        });
        return object;
    })();
}

module.exports = {
    objectDefaults
}