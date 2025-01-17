"use strict";

var arrayProto = require("@sinonjs/commons").prototypes.array;
var deepEqual = require("./deep-equal").use(createMatcher); // eslint-disable-line no-use-before-define
var every = require("@sinonjs/commons").every;
var functionName = require("@sinonjs/commons").functionName;
var get = require("lodash").get;
var iterableToString = require("./iterable-to-string");
var objectProto = require("@sinonjs/commons").prototypes.object;
var stringProto = require("@sinonjs/commons").prototypes.string;
var typeOf = require("@sinonjs/commons").typeOf;
var valueToString = require("@sinonjs/commons").valueToString;

var arrayIndexOf = arrayProto.indexOf;
var arrayEvery = arrayProto.every;
var join = arrayProto.join;
var map = arrayProto.map;
var some = arrayProto.some;

var hasOwnProperty = objectProto.hasOwnProperty;
var isPrototypeOf = objectProto.isPrototypeOf;
var objectToString = objectProto.toString;

var stringIndexOf = stringProto.indexOf;

var matcher = {
    toString: function() {
        return this.message;
    }
};

/**
 * Returns `true` when `object` is a matcher
 *
 * @private
 * @param {*} object A value to examine
 * @returns {boolean} Returns `true` when `object` is a matcher
 */
function isMatcher(object) {
    return isPrototypeOf(matcher, object);
}

/**
 * Ensures that value is of type
 *
 * @private
 * @param {*} value A value to examine
 * @param {string} type A basic JavaScript type to compare to, e.g. "object", "string"
 * @param {string} name A string to use for the error message
 * @throws {TypeError} If value is not of the expected type
 * @returns {undefined}
 */
function assertType(value, type, name) {
    var actual = typeOf(value);
    if (actual !== type) {
        throw new TypeError(
            "Expected type of " +
                name +
                " to be " +
                type +
                ", but was " +
                actual
        );
    }
}

/**
 * Throws a TypeError when expected method doesn't exist
 *
 * @private
 * @param {*} value A value to examine
 * @param {string} method The name of the method to look for
 * @param {name} name A name to use for the error message
 * @param {string} methodPath The name of the method to use for error messages
 * @throws {TypeError} When the method doesn't exist
 */
function assertMethodExists(value, method, name, methodPath) {
    if (value[method] === null || value[method] === undefined) {
        throw new TypeError(
            "Expected " + name + " to have method " + methodPath
        );
    }
}

/**
 * Throws a TypeError when `value` is not a matcher
 *
 * @private
 * @param {*} value The value to examine
 */
function assertMatcher(value) {
    if (!isMatcher(value)) {
        throw new TypeError("Matcher expected");
    }
}

/**
 * Returns `true` for iterables
 *
 * @private
 * @param {*} value A value to examine
 * @returns {boolean} Returns `true` when `value` looks like an iterable
 */
function isIterable(value) {
    return Boolean(value) && typeOf(value.forEach) === "function";
}

/**
 * Matches `actual` with `expectation`
 *
 * @private
 * @param {*} actual A value to examine
 * @param {object} expectation An object with properties to match on
 * @returns {boolean} Returns true when `actual` matches all properties in `expectation`
 */
function matchObject(actual, expectation) {
    if (actual === null || actual === undefined) {
        return false;
    }

    return arrayEvery(Object.keys(expectation), function(key) {
        var exp = expectation[key];
        var act = actual[key];

        if (isMatcher(exp)) {
            if (!exp.test(act)) {
                return false;
            }
        } else if (typeOf(exp) === "object") {
            if (!matchObject(act, exp)) {
                return false;
            }
        } else if (!deepEqual(act, exp)) {
            return false;
        }

        return true;
    });
}

var TYPE_MAP = {
    function: function(m, expectation, message) {
        m.test = expectation;
        m.message = message || "match(" + functionName(expectation) + ")";
    },
    number: function(m, expectation) {
        m.test = function(actual) {
            // we need type coercion here
            return expectation == actual; // eslint-disable-line eqeqeq
        };
    },
    object: function(m, expectation) {
        var array = [];

        if (typeof expectation.test === "function") {
            m.test = function(actual) {
                return expectation.test(actual) === true;
            };
            m.message = "match(" + functionName(expectation.test) + ")";
            return m;
        }

        array = map(Object.keys(expectation), function(key) {
            return key + ": " + valueToString(expectation[key]);
        });

        m.test = function(actual) {
            return matchObject(actual, expectation);
        };
        m.message = "match(" + join(array, ", ") + ")";

        return m;
    },
    regexp: function(m, expectation) {
        m.test = function(actual) {
            return typeof actual === "string" && expectation.test(actual);
        };
    },
    string: function(m, expectation) {
        m.test = function(actual) {
            return (
                typeof actual === "string" &&
                stringIndexOf(actual, expectation) !== -1
            );
        };
        m.message = 'match("' + expectation + '")';
    }
};

/**
 * Creates a matcher object for the passed expectation
 *
 * @alias module:samsam.createMatcher
 * @param {*} expectation An expecttation
 * @param {string} message A message for the expectation
 * @returns {object} A matcher object
 */
function createMatcher(expectation, message) {
    var m = Object.create(matcher);
    var type = typeOf(expectation);

    if (message !== undefined && typeof message !== "string") {
        throw new TypeError("Message should be a string");
    }

    if (arguments.length > 2) {
        throw new TypeError(
            "Expected 1 or 2 arguments, received " + arguments.length
        );
    }

    if (type in TYPE_MAP) {
        TYPE_MAP[type](m, expectation, message);
    } else {
        m.test = function(actual) {
            return deepEqual(actual, expectation);
        };
    }

    if (!m.message) {
        m.message = "match(" + valueToString(expectation) + ")";
    }

    return m;
}

matcher.or = function(valueOrMatcher) {
    if (!arguments.length) {
        throw new TypeError("Matcher expected");
    }

    var m2 = isMatcher(valueOrMatcher)
        ? valueOrMatcher
        : createMatcher(valueOrMatcher);
    var m1 = this;
    var or = Object.create(matcher);
    or.test = function(actual) {
        return m1.test(actual) || m2.test(actual);
    };
    or.message = m1.message + ".or(" + m2.message + ")";
    return or;
};

matcher.and = function(valueOrMatcher) {
    if (!arguments.length) {
        throw new TypeError("Matcher expected");
    }

    var m2 = isMatcher(valueOrMatcher)
        ? valueOrMatcher
        : createMatcher(valueOrMatcher);
    var m1 = this;
    var and = Object.create(matcher);
    and.test = function(actual) {
        return m1.test(actual) && m2.test(actual);
    };
    and.message = m1.message + ".and(" + m2.message + ")";
    return and;
};

createMatcher.isMatcher = isMatcher;

createMatcher.any = createMatcher(function() {
    return true;
}, "any");

createMatcher.defined = createMatcher(function(actual) {
    return actual !== null && actual !== undefined;
}, "defined");

createMatcher.truthy = createMatcher(function(actual) {
    return Boolean(actual);
}, "truthy");

createMatcher.falsy = createMatcher(function(actual) {
    return !actual;
}, "falsy");

createMatcher.same = function(expectation) {
    return createMatcher(function(actual) {
        return expectation === actual;
    }, "same(" + valueToString(expectation) + ")");
};

createMatcher.in = function(arrayOfExpectations) {
    if (typeOf(arrayOfExpectations) !== "array") {
        throw new TypeError("array expected");
    }

    return createMatcher(function(actual) {
        return some(arrayOfExpectations, function(expectation) {
            return expectation === actual;
        });
    }, "in(" + valueToString(arrayOfExpectations) + ")");
};

createMatcher.typeOf = function(type) {
    assertType(type, "string", "type");
    return createMatcher(function(actual) {
        return typeOf(actual) === type;
    }, 'typeOf("' + type + '")');
};

createMatcher.instanceOf = function(type) {
    if (
        typeof Symbol === "undefined" ||
        typeof Symbol.hasInstance === "undefined"
    ) {
        assertType(type, "function", "type");
    } else {
        assertMethodExists(
            type,
            Symbol.hasInstance,
            "type",
            "[Symbol.hasInstance]"
        );
    }
    return createMatcher(function(actual) {
        return actual instanceof type;
    }, "instanceOf(" + (functionName(type) || objectToString(type)) + ")");
};

/**
 * Creates a property matcher
 *
 * @private
 * @param {Function} propertyTest A function to test the property against a value
 * @param {string} messagePrefix A prefix to use for messages generated by the matcher
 * @returns {object} A matcher
 */
function createPropertyMatcher(propertyTest, messagePrefix) {
    return function(property, value) {
        assertType(property, "string", "property");
        var onlyProperty = arguments.length === 1;
        var message = messagePrefix + '("' + property + '"';
        if (!onlyProperty) {
            message += ", " + valueToString(value);
        }
        message += ")";
        return createMatcher(function(actual) {
            if (
                actual === undefined ||
                actual === null ||
                !propertyTest(actual, property)
            ) {
                return false;
            }
            return onlyProperty || deepEqual(actual[property], value);
        }, message);
    };
}

createMatcher.has = createPropertyMatcher(function(actual, property) {
    if (typeof actual === "object") {
        return property in actual;
    }
    return actual[property] !== undefined;
}, "has");

createMatcher.hasOwn = createPropertyMatcher(function(actual, property) {
    return hasOwnProperty(actual, property);
}, "hasOwn");

createMatcher.hasNested = function(property, value) {
    assertType(property, "string", "property");
    var onlyProperty = arguments.length === 1;
    var message = 'hasNested("' + property + '"';
    if (!onlyProperty) {
        message += ", " + valueToString(value);
    }
    message += ")";
    return createMatcher(function(actual) {
        if (
            actual === undefined ||
            actual === null ||
            get(actual, property) === undefined
        ) {
            return false;
        }
        return onlyProperty || deepEqual(get(actual, property), value);
    }, message);
};

createMatcher.every = function(predicate) {
    assertMatcher(predicate);

    return createMatcher(function(actual) {
        if (typeOf(actual) === "object") {
            return every(Object.keys(actual), function(key) {
                return predicate.test(actual[key]);
            });
        }

        return (
            isIterable(actual) &&
            every(actual, function(element) {
                return predicate.test(element);
            })
        );
    }, "every(" + predicate.message + ")");
};

createMatcher.some = function(predicate) {
    assertMatcher(predicate);

    return createMatcher(function(actual) {
        if (typeOf(actual) === "object") {
            return !every(Object.keys(actual), function(key) {
                return !predicate.test(actual[key]);
            });
        }

        return (
            isIterable(actual) &&
            !every(actual, function(element) {
                return !predicate.test(element);
            })
        );
    }, "some(" + predicate.message + ")");
};

createMatcher.array = createMatcher.typeOf("array");

createMatcher.array.deepEquals = function(expectation) {
    return createMatcher(function(actual) {
        // Comparing lengths is the fastest way to spot a difference before iterating through every item
        var sameLength = actual.length === expectation.length;
        return (
            typeOf(actual) === "array" &&
            sameLength &&
            every(actual, function(element, index) {
                var expected = expectation[index];
                return typeOf(expected) === "array" &&
                    typeOf(element) === "array"
                    ? createMatcher.array.deepEquals(expected).test(element)
                    : deepEqual(expected, element);
            })
        );
    }, "deepEquals([" + iterableToString(expectation) + "])");
};

createMatcher.array.startsWith = function(expectation) {
    return createMatcher(function(actual) {
        return (
            typeOf(actual) === "array" &&
            every(expectation, function(expectedElement, index) {
                return actual[index] === expectedElement;
            })
        );
    }, "startsWith([" + iterableToString(expectation) + "])");
};

createMatcher.array.endsWith = function(expectation) {
    return createMatcher(function(actual) {
        // This indicates the index in which we should start matching
        var offset = actual.length - expectation.length;

        return (
            typeOf(actual) === "array" &&
            every(expectation, function(expectedElement, index) {
                return actual[offset + index] === expectedElement;
            })
        );
    }, "endsWith([" + iterableToString(expectation) + "])");
};

createMatcher.array.contains = function(expectation) {
    return createMatcher(function(actual) {
        return (
            typeOf(actual) === "array" &&
            every(expectation, function(expectedElement) {
                return arrayIndexOf(actual, expectedElement) !== -1;
            })
        );
    }, "contains([" + iterableToString(expectation) + "])");
};

createMatcher.map = createMatcher.typeOf("map");

createMatcher.map.deepEquals = function mapDeepEquals(expectation) {
    return createMatcher(function(actual) {
        // Comparing lengths is the fastest way to spot a difference before iterating through every item
        var sameLength = actual.size === expectation.size;
        return (
            typeOf(actual) === "map" &&
            sameLength &&
            every(actual, function(element, key) {
                return expectation.has(key) && expectation.get(key) === element;
            })
        );
    }, "deepEquals(Map[" + iterableToString(expectation) + "])");
};

createMatcher.map.contains = function mapContains(expectation) {
    return createMatcher(function(actual) {
        return (
            typeOf(actual) === "map" &&
            every(expectation, function(element, key) {
                return actual.has(key) && actual.get(key) === element;
            })
        );
    }, "contains(Map[" + iterableToString(expectation) + "])");
};

createMatcher.set = createMatcher.typeOf("set");

createMatcher.set.deepEquals = function setDeepEquals(expectation) {
    return createMatcher(function(actual) {
        // Comparing lengths is the fastest way to spot a difference before iterating through every item
        var sameLength = actual.size === expectation.size;
        return (
            typeOf(actual) === "set" &&
            sameLength &&
            every(actual, function(element) {
                return expectation.has(element);
            })
        );
    }, "deepEquals(Set[" + iterableToString(expectation) + "])");
};

createMatcher.set.contains = function setContains(expectation) {
    return createMatcher(function(actual) {
        return (
            typeOf(actual) === "set" &&
            every(expectation, function(element) {
                return actual.has(element);
            })
        );
    }, "contains(Set[" + iterableToString(expectation) + "])");
};

createMatcher.bool = createMatcher.typeOf("boolean");
createMatcher.number = createMatcher.typeOf("number");
createMatcher.string = createMatcher.typeOf("string");
createMatcher.object = createMatcher.typeOf("object");
createMatcher.func = createMatcher.typeOf("function");
createMatcher.regexp = createMatcher.typeOf("regexp");
createMatcher.date = createMatcher.typeOf("date");
createMatcher.symbol = createMatcher.typeOf("symbol");

module.exports = createMatcher;
