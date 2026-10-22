/**
 * Literal inliner for Babel / webcrack output.
 * Never executes the input JavaScript. Never removes original assignments.
 *
 * From project root:
 *   node tools/inline-constants-v3-native-aliases.cjs --version
 *   node tools/inline-constants-v3-native-aliases.cjs --mode bootstrap
 *   node tools/inline-constants-v3-native-aliases.cjs --mode strict
 *   node tools/inline-constants-v3-native-aliases.cjs --mode analysis
 *   node tools/inline-constants-v3-native-aliases.cjs --mode bootstrap --native-aliases rename
 *   node tools/inline-constants-v3-native-aliases.cjs --mode bootstrap --native-aliases inline
 *
 * Modes:
 *   strict    - replace only later reads in the same straight-line block.
 *   bootstrap - additionally inline bindings set in a discovered synchronous
 *               initializer chain (assumes helpers are not called early).
 *   analysis  - inline any one-write literal binding, regardless of ordering;
 *               for reverse-engineering copies ONLY; may change behavior.
 *
 * Native alias modes (opt-in):
 *   off    - leave `let cm = Array` unchanged (default).
 *   rename - preserve the captured Array object; rename cm to ArrayCtor.
 *   inline - replace cm uses with Array where ordering/scope allows.
 *            ANALYSIS ONLY: a global constructor might be monkey-patched.
 */

'use strict';

const SCRIPT_VERSION = '3.0.0-native-aliases';

const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const t = require('@babel/types');

const INTRINSIC_NAMES = new Set([
    'Object', 'Array', 'Function', 'Boolean', 'Number', 'BigInt', 'String',
    'Symbol', 'Date', 'RegExp', 'Error', 'EvalError', 'RangeError',
    'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'AggregateError',
    'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef',
    'FinalizationRegistry', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
    'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array',
    'Uint16Array', 'Int32Array', 'Uint32Array', 'BigInt64Array',
    'BigUint64Array', 'Float32Array', 'Float64Array',
    'Math', 'JSON', 'Reflect', 'Intl', 'Atomics'
]);

const BUILTIN_OBJECT_NAMES = new Set(['Math', 'JSON', 'Reflect', 'Intl', 'Atomics']);

function intrinsicAlias(expression) {
    if (!expression?.isIdentifier()) return null;
    const name = expression.node.name;
    // A locally declared `Array` is not the built-in constructor.
    if (!INTRINSIC_NAMES.has(name) || expression.scope.getBinding(name)) return null;
    return t.identifier(name);
}

function friendlyIntrinsicName(name) {
    return name + (BUILTIN_OBJECT_NAMES.has(name) ? 'Builtin' : 'Ctor');
}

function options(argv) {
    const opt = {
        mode: 'strict',
        input: 'output/deobfuscated.js',
        output: 'output/deobfuscated.inlined.js',
        report: 'output/inline-report.json',
        bootstrapRoot: null,
        nativeAliases: 'off'
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) throw Error(`Unexpected argument: ${arg}`);
        const name = {
            '--mode': 'mode', '--input': 'input', '--output': 'output',
            '--report': 'report', '--bootstrap-root': 'bootstrapRoot',
            '--native-aliases': 'nativeAliases'
        }[arg];
        if (!name || !argv[i + 1]) throw Error(`Missing or unsupported option: ${arg}`);
        opt[name] = argv[++i];
    }
    if (!['strict', 'bootstrap', 'analysis'].includes(opt.mode)) {
        throw Error(`Invalid --mode: ${opt.mode}`);
    }
    if (!['off', 'rename', 'inline'].includes(opt.nativeAliases)) {
        throw Error(`Invalid --native-aliases: ${opt.nativeAliases}`);
    }
    opt.input = path.resolve(opt.input);
    opt.output = path.resolve(opt.output);
    opt.report = path.resolve(opt.report);
    if (opt.input === opt.output) throw Error('Input and output must differ.');
    return opt;
}

function staticLiteral(node) {
    if (
        t.isStringLiteral(node) || t.isNumericLiteral(node) ||
        t.isBooleanLiteral(node) || t.isNullLiteral(node) ||
        t.isBigIntLiteral(node)
    ) return t.cloneNode(node, true);

    if (t.isTemplateLiteral(node) && node.expressions.length === 0 && node.quasis.length === 1) {
        const value = node.quasis[0].value.cooked;
        return value == null ? null : t.stringLiteral(value);
    }

    // Retain the UnaryExpression so that -0 keeps its meaning.
    if (
        t.isUnaryExpression(node) && ['-', '+'].includes(node.operator) &&
        t.isNumericLiteral(node.argument)
    ) return t.cloneNode(node, true);

    return null;
}

function location(node) {
    return node?.loc?.start ? `${node.loc.start.line}:${node.loc.start.column + 1}` : '?';
}

function bareCall(statement) {
    let expression;
    if (statement.isExpressionStatement()) expression = statement.get('expression');
    if (statement.isReturnStatement()) expression = statement.get('argument');
    if (!expression?.isCallExpression() || expression.node.arguments.length) return null;
    return expression.get('callee').isIdentifier() ? expression : null;
}

function linearInitializer(binding) {
    const fn = binding?.path;
    if (!fn?.isFunctionDeclaration()) return null;
    const statements = fn.get('body.body');
    if (!statements.length) return null;
    let next = null;
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const isAssignment = stmt.isExpressionStatement() &&
            stmt.get('expression').isAssignmentExpression({operator: '='}) &&
            stmt.get('expression.left').isIdentifier();
        if (isAssignment) continue;
        if (i === statements.length - 1 && (next = bareCall(stmt))) continue;
        return null;
    }
    return {fn, next, statements};
}

function buildChain(rootBinding) {
    const chain = [];
    const seen = new Set();
    let binding = rootBinding;
    while (binding && !seen.has(binding)) {
        const info = linearInitializer(binding);
        if (!info) break;
        seen.add(binding);
        chain.push({name: binding.identifier.name, ...info});
        if (!info.next) break;
        const nextName = info.next.get('callee').node.name;
        binding = info.next.scope.getBinding(nextName);
    }
    return chain;
}

function directBodyStatement(write, functionPath) {
    const statement = write.getStatementParent();
    return !!(
        statement && statement.parentPath?.node === functionPath.node.body &&
        write.getFunctionParent()?.node === functionPath.node
    );
}

function main() {
    const opt = options(process.argv.slice(2));
    const code = fs.readFileSync(opt.input, 'utf8');
    const ast = parser.parse(code, {sourceType: 'unambiguous'});
    const candidates = new Map();
    const assignments = new Map();

    // A binding object, not an identifier spelling, is the identity key.
    traverse(ast, {
        VariableDeclarator(p) {
            if (!t.isIdentifier(p.node.id)) return;
            const literal = staticLiteral(p.node.init);
            const intrinsic = opt.nativeAliases === 'off' ? null : intrinsicAlias(p.get('init'));
            if (!literal && !intrinsic) return;
            const binding = p.scope.getBinding(p.node.id.name);
            if (!binding || binding.path !== p || !binding.constant) return;
            candidates.set(binding, {
                binding, literal: literal || intrinsic, write: p, kind: 'declaration',
                valueKind: intrinsic ? 'intrinsic' : 'literal'
            });
        },
        AssignmentExpression(p) {
            if (p.node.operator !== '=' || !t.isIdentifier(p.node.left)) return;
            const literal = staticLiteral(p.node.right);
            const intrinsic = opt.nativeAliases === 'off' ? null : intrinsicAlias(p.get('right'));
            if (!literal && !intrinsic) return;
            const binding = p.scope.getBinding(p.node.left.name);
            if (!binding) return;
            const list = assignments.get(binding) || [];
            list.push({
                binding, literal: literal || intrinsic, write: p, kind: 'assignment',
                valueKind: intrinsic ? 'intrinsic' : 'literal'
            });
            assignments.set(binding, list);
        }
    });

    for (const [binding, writes] of assignments) {
        if (writes.length !== 1 || !binding.path.isVariableDeclarator()) continue;
        if (binding.path.node.init != null) continue;
        if (
            binding.constantViolations.length !== 1 ||
            binding.constantViolations[0].node !== writes[0].write.node
        ) continue;
        candidates.set(binding, writes[0]);
    }

    // The scope with the largest set of literal bindings is the candidate
    // initializer factory. Only a direct, linear zero-argument call can seed
    // bootstrap propagation. Ambiguous roots are reported, not silently guessed.
    const counts = new Map();
    for (const candidate of candidates.values()) {
        const scope = candidate.binding.scope;
        if (scope.path.isFunction() && t.isBlockStatement(scope.path.node.body)) {
            counts.set(scope, (counts.get(scope) || 0) + 1);
        }
    }
    const factoryScope = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const factory = factoryScope?.path;
    let bootstrap = null;
    const rootOptions = [];
    if (factory) {
        for (const stmt of factory.get('body.body')) {
            const call = bareCall(stmt);
            if (!call) continue;
            const name = call.get('callee').node.name;
            if (opt.bootstrapRoot && name !== opt.bootstrapRoot) continue;
            const binding = call.scope.getBinding(name);
            if (!binding) continue;
            const chain = buildChain(binding);
            if (!chain.length) continue;
            const nodes = new Set(chain.map(x => x.fn.node));
            const weight = [...candidates.values()].filter(x =>
                x.binding.scope === factoryScope && nodes.has(x.write.getFunctionParent()?.node)
            ).length;
            rootOptions.push({name, call, chain, nodes, weight});
        }
        rootOptions.sort((a, b) => b.weight - a.weight);
        if (rootOptions[0] &&
            (opt.bootstrapRoot || rootOptions[0].weight >= 20 &&
                rootOptions[0].weight > (rootOptions[1]?.weight || 0))) {
            bootstrap = rootOptions[0];
        }
    }
    if (opt.mode === 'bootstrap' && !bootstrap) {
        throw Error('Could not identify a unique bootstrap chain. Provide --bootstrap-root NAME or use --mode strict.');
    }

    // Conservatively collect functions that could run during initialization.
    // This includes helpers called by the initializer, e.g. p() used to decode
    // strings while many bindings are still undefined. Replacing their reads
    // with final values can otherwise change behavior during SDK startup.
    const possiblyExecutedDuringBoot = new Set();
    if (bootstrap) {
        const callsByFunction = new Map();
        traverse(ast, {
            CallExpression(p) {
                const caller = p.getFunctionParent()?.node;
                if (!caller) return;
                // Only calls made before or at the factory's bootstrap entry are
                // relevant to early reads. Later calls happen after initialization.
                if (caller === factory.node && p.node.start > bootstrap.call.node.start) return;
                const callee = p.get('callee');
                let calledFunction;
                if (callee.isIdentifier()) {
                    const binding = p.scope.getBinding(callee.node.name);
                    if (binding?.path.isFunction()) calledFunction = binding.path.node;
                } else if (callee.isFunctionExpression() || callee.isArrowFunctionExpression()) {
                    calledFunction = callee.node;
                }
                if (!calledFunction) return;
                const called = callsByFunction.get(caller) || new Set();
                called.add(calledFunction);
                callsByFunction.set(caller, called);
            }
        });
        const queue = [factory.node];
        while (queue.length) {
            const fn = queue.pop();
            if (possiblyExecutedDuringBoot.has(fn)) continue;
            possiblyExecutedDuringBoot.add(fn);
            for (const callee of callsByFunction.get(fn) || []) queue.push(callee);
        }
    }

    const stats = {
        scriptVersion: SCRIPT_VERSION, mode: opt.mode, nativeAliases: opt.nativeAliases,
        sourceFile: opt.input, outputFile: opt.output,
        candidates: candidates.size, eligibleBindings: 0,
        fullyInlinedBindings: 0, partiallyInlinedBindings: 0,
        replacedReferences: 0, skippedReferences: 0,
        skipReasons: {}, perBinding: [],
        intrinsicCandidates: [...candidates.values()].filter(x => x.valueKind === 'intrinsic').length,
        renamedIntrinsicBindings: 0, renamedIntrinsics: [],
        optimizedMemberExpressions: 0,
        bootstrap: bootstrap ? {
            entry: bootstrap.name,
            callAt: location(bootstrap.call.node),
            chain: bootstrap.chain.map(x => ({name: x.name, at: location(x.fn.node)})),
            chainCandidateBindings: bootstrap.weight
        } : null,
        possiblyExecutedDuringBootFunctions: possiblyExecutedDuringBoot.size,
        examples: {}, caveats: [
            'Syntactic validity does not prove runtime equivalence.',
            'Bootstrap mode assumes helper functions are not invoked before the initializer completes.',
            'Dynamically executed code (for example eval/Function) cannot be proven safe by this static analysis.'
        ]
    };
    if (opt.nativeAliases === 'inline') {
        stats.caveats.push(
            'Intrinsic inlining is for static analysis: global constructors may be reassigned after the alias captures them.'
        );
    }

    function replacementDecision(candidate, ref) {
        const readStatement = ref.getStatementParent();
        const writeStatement = candidate.write.getStatementParent();
        const sameLaterBlock = !!(
            readStatement && writeStatement &&
            readStatement.parentPath === writeStatement.parentPath &&
            readStatement.node.start > writeStatement.node.end
        );
        if (sameLaterBlock) return null;
        if (opt.mode === 'strict') return 'strict_scope_or_execution_order';
        if (opt.mode === 'analysis') return null;

        if (!bootstrap || candidate.binding.scope !== factoryScope) return 'not_in_bootstrap_factory';
        const writerFn = candidate.write.getFunctionParent();
        const bootWrite = bootstrap.nodes.has(writerFn?.node) ||
            (writerFn?.node === factory.node && directBodyStatement(candidate.write, factory));
        if (!bootWrite) return 'write_outside_linear_initializer';

        // A function expression first created by a direct `var f = function...`
        // statement after the bootstrap call cannot have run during that call.
        // This allows post-bootstrap consumers such as G7 without treating all
        // statically reachable functions as safe.
        let enclosing = ref.getFunctionParent();
        while (enclosing && enclosing.node !== factory.node) {
            const declaration = enclosing.parentPath;
            const iife = declaration?.isCallExpression() && enclosing.key === 'callee';
            const creator = iife ? declaration.parentPath : declaration;
            if (
                (enclosing.isFunctionExpression() || enclosing.isArrowFunctionExpression()) &&
                creator?.isVariableDeclarator() &&
                creator.node.init === (iife ? declaration.node : enclosing.node) &&
                creator.parentPath?.isVariableDeclaration() &&
                creator.parentPath.parentPath?.node === factory.node.body &&
                creator.node.start > bootstrap.call.node.end
            ) return null;
            enclosing = enclosing.findParent(p => p.isFunction());
        }

        // Reads while the initializer or its helper functions run may depend on
        // assignment order. Function declarations are not execution barriers.
        const readerFn = ref.getFunctionParent();
        if (readerFn?.node === factory.node) {
            return (
                readStatement?.parentPath?.node === factory.node.body &&
                readStatement.node.start > bootstrap.call.node.end
            ) ? null : 'factory_read_before_bootstrap';
        }
        if (possiblyExecutedDuringBoot.has(readerFn?.node)) return 'function_may_execute_during_bootstrap';
        return null;
    }

    // referencePaths already respect lexical scopes, including closures.
    for (const candidate of candidates.values()) {
        if (candidate.valueKind === 'intrinsic' && opt.nativeAliases === 'rename') continue;
        const name = candidate.binding.identifier.name;
        let replacedForBinding = 0;
        const skippedByReason = {};
        for (const ref of [...candidate.binding.referencePaths]) {
            if (!ref.node || ref.removed || !ref.isIdentifier() || !ref.isReferencedIdentifier()) continue;
            const parent = ref.parentPath;
            const invalidWritePosition = (
                (parent.isAssignmentExpression() && ref.key === 'left') ||
                parent.isUpdateExpression() || parent.isExportSpecifier() ||
                (parent.isForXStatement() && ref.key === 'left')
            );
            const intrinsicShadowed = candidate.valueKind === 'intrinsic' &&
                !!ref.scope.getBinding(candidate.literal.name);
            const reason = invalidWritePosition ? 'non_replaceable_ast_position' :
                intrinsicShadowed ? 'intrinsic_name_shadowed_at_read' :
                    replacementDecision(candidate, ref);
            if (reason) {
                stats.skippedReferences++;
                stats.skipReasons[reason] = (stats.skipReasons[reason] || 0) + 1;
                skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
                continue;
            }
            if (parent.isObjectProperty() && parent.node.shorthand && ref.key === 'value') {
                parent.node.shorthand = false;
            }
            ref.replaceWith(t.cloneNode(candidate.literal, true));
            stats.replacedReferences++;
            replacedForBinding++;
        }
        if (replacedForBinding) stats.eligibleBindings++;
        const refs = candidate.binding.referencePaths.length;
        if (refs && replacedForBinding === refs) stats.fullyInlinedBindings++;
        else if (replacedForBinding) stats.partiallyInlinedBindings++;
        stats.perBinding.push({
            name, value: generator(candidate.literal).code,
            assignmentAt: location(candidate.write.node),
            references: refs, replaced: replacedForBinding, skippedByReason
        });
        if (['HC', 'HE', 'UF'].includes(name)) {
            stats.examples[name] = {
                value: generator(candidate.literal).code,
                assignmentAt: location(candidate.write.node),
                totalReferences: candidate.binding.referencePaths.length,
                replacedReferences: replacedForBinding
            };
        }
    }

    // Rename is the semantics-preserving alternative to intrinsic inlining:
    // `let cm = Array; cm.from(...)` -> `let ArrayCtor = Array; ArrayCtor.from(...)`.
    // Scope-aware renaming also protects references in nested closures.
    if (opt.nativeAliases === 'rename') {
        const usedNames = new Set();
        traverse(ast, {
            Identifier(p) {
                usedNames.add(p.node.name);
            }
        });
        for (const candidate of candidates.values()) {
            if (candidate.valueKind !== 'intrinsic') continue;
            const oldName = candidate.binding.identifier.name;
            const base = friendlyIntrinsicName(candidate.literal.name);
            let newName = base;
            for (let n = 2; usedNames.has(newName); n++) newName = `${base}${n}`;
            usedNames.add(newName);
            candidate.binding.scope.rename(oldName, newName);
            stats.renamedIntrinsicBindings++;
            stats.renamedIntrinsics.push({
                from: oldName, to: newName, intrinsic: candidate.literal.name,
                assignmentAt: location(candidate.write.node),
                references: candidate.binding.referencePaths.length
            });
        }
    }

    traverse(ast, {
        'MemberExpression|OptionalMemberExpression'(p) {
            if (!p.node.computed || !t.isStringLiteral(p.node.property)) return;
            const name = p.node.property.value;
            if (!t.isValidIdentifier(name)) return;
            p.node.property = t.identifier(name);
            p.node.computed = false;
            stats.optimizedMemberExpressions++;
        }
    });

    const output = generator(ast, {
        retainLines: false, comments: true, compact: false, concise: false
    }).code;
    parser.parse(output, {sourceType: 'unambiguous'});
    fs.mkdirSync(path.dirname(opt.output), {recursive: true});
    fs.mkdirSync(path.dirname(opt.report), {recursive: true});
    fs.writeFileSync(opt.output, output, 'utf8');
    fs.writeFileSync(opt.report, JSON.stringify(stats, null, 2), 'utf8');

    console.log(JSON.stringify({
        scriptVersion: stats.scriptVersion,
        mode: stats.mode,
        nativeAliases: stats.nativeAliases,
        candidates: stats.candidates,
        intrinsicCandidates: stats.intrinsicCandidates,
        renamedIntrinsicBindings: stats.renamedIntrinsicBindings,
        renamedIntrinsics: stats.renamedIntrinsics.slice(0, 40),
        eligibleBindings: stats.eligibleBindings,
        fullyInlinedBindings: stats.fullyInlinedBindings,
        partiallyInlinedBindings: stats.partiallyInlinedBindings,
        replacedReferences: stats.replacedReferences,
        skippedReferences: stats.skippedReferences,
        skipReasons: stats.skipReasons,
        optimizedMemberExpressions: stats.optimizedMemberExpressions,
        bootstrap: stats.bootstrap,
        examples: stats.examples,
        output: opt.output,
        report: opt.report
    }, null, 2));
}

if (process.argv.length === 3 && process.argv[2] === '--version') {
    console.log(SCRIPT_VERSION);
} else {
    try {
        main();
    } catch (error) {
        console.error(error.stack || error);
        process.exitCode = 1;
    }
}
