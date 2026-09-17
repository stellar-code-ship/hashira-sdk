/**
 * Emits the SDK's request and response types from Hashira's published OpenAPI document.
 *
 * The document is fetched from the running API rather than vendored here, so there is one source of
 * truth and nothing to keep in step by hand. It is produced from the very Zod schemas the API
 * validates against, which is what makes it the contract rather than a description of one.
 *
 * Run with `--check` to verify the committed output still matches the document instead of rewriting
 * it. Both modes share one render pass, so they cannot disagree about paths or format.
 */

const defaultDocumentUrl = "https://api.hashira.stellarcode.space/openapi.json";

/** Point at another deployment — a local app, or staging — without editing this file. */
const documentUrl = process.env.HASHIRA_OPENAPI_URL ?? defaultDocumentUrl;

const generatedDirectoryUrl = new URL("../src/generated/", import.meta.url);

/** The tags whose operations the SDK actually exposes. Widen it as resources are added. */
const shippedTags = ["Emails"] as const;

/**
 * Object shapes that appear in more than one place get hoisted to a named type instead of being
 * inlined at each site. The key is the shape's sorted property names, which is stable across
 * regenerations and readable enough to act on when the generator asks for a new name.
 *
 * Naming stays human on purpose: a derived name like `GetEmailResponse` would be what consumers
 * see for the shape every read of a message returns, and that reads as an accident rather than a
 * type. An unnamed repeated shape fails the run rather than being inlined twice.
 */
const sharedShapeNames: Record<string, string> = {
	// Empty since 2.0, and correctly so: the published document describes one operation, and one
	// operation cannot repeat a shape. The mechanism stays because the next published endpoint is
	// what it exists for — an unnamed repeated shape fails the run rather than being inlined twice.
};

type JsonSchema = Record<string, unknown>;

function fail(message: string): never {
	console.error(`generate-api-types: ${message}`);
	process.exit(2);
}

function isObject(value: unknown): value is JsonSchema {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pascalCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The sorted property names of an object schema, used as its identity. */
function fingerprintOf(schema: JsonSchema): string | null {
	if (schema.type !== "object" || !isObject(schema.properties)) {
		return null;
	}

	return Object.keys(schema.properties).sort().join(",");
}

function renderDocComment(description: unknown, indent: string): string {
	if (typeof description !== "string" || description.length === 0) {
		return "";
	}

	// A description is free prose written for the API reference; `*/` inside one would close the
	// comment early and break the emitted file.
	const lines = description.replaceAll("*/", "*\\/").split("\n");

	return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join("\n")}\n${indent} */\n`;
}

function renderLiteral(value: unknown): string {
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function renderSchema(schema: JsonSchema, indent: string, hoisted: Map<string, string>): string {
	if ("$ref" in schema) {
		// The document's only refs are `#/$defs/__schema0` and `__schema1`, which Zod emitted nested
		// inside the /logs and /traces bodies rather than at the document root — they do not resolve
		// from there at all. Neither belongs to a shipped tag today. Failing here is what makes that
		// surface when Logs and Traces are added, instead of emitting something quietly wrong.
		fail(`unresolvable $ref ${String(schema.$ref)}. Hoist it to components.schemas before shipping its tag.`);
	}

	if ("const" in schema) {
		return renderLiteral(schema.const);
	}

	// OpenAPI 3.1 lets `type` be a list, and this document uses it for every nullable field:
	// Elysia renders `z.string().nullable()` as `type: ["string", "null"]` rather than as an
	// `anyOf`. Each member is rendered against the same sibling keywords — `items`, `properties`,
	// `enum` — because those describe the non-null member and would otherwise be dropped along with
	// it. Handled ahead of `enum` for exactly that reason: a nullable enum carries its four literals
	// in `enum` and its null in `type`, so matching `enum` first would silently lose the null.
	if (Array.isArray(schema.type)) {
		const members = schema.type.map((member) =>
			member === "null" ? "null" : renderSchema({ ...schema, type: member }, indent, hoisted),
		);

		return [...new Set(members)].join(" | ");
	}

	if (Array.isArray(schema.enum)) {
		return schema.enum.map(renderLiteral).join(" | ");
	}

	if (Array.isArray(schema.anyOf)) {
		const members = schema.anyOf
			.filter(isObject)
			.map((member) => renderSchema(member, indent, hoisted))
			// A union member that is itself an object literal needs parentheses to sit in a union.
			.map((member) => (member.includes("\n") ? `(${member})` : member));

		return [...new Set(members)].join(" | ");
	}

	const type = schema.type;

	if (type === "null") {
		return "null";
	}

	if (type === "string") {
		return schema.format === "binary" ? "Blob" : "string";
	}

	if (type === "integer" || type === "number") {
		return "number";
	}

	if (type === "boolean") {
		return "boolean";
	}

	if (type === "array") {
		const items = isObject(schema.items) ? renderSchema(schema.items, indent, hoisted) : "unknown";

		return items.includes("\n") || items.includes("|") ? `Array<${items}>` : `${items}[]`;
	}

	if (type === "object") {
		const fingerprint = fingerprintOf(schema);
		const hoistedName = fingerprint === null ? undefined : hoisted.get(fingerprint);

		if (hoistedName !== undefined) {
			return hoistedName;
		}

		return renderObjectBody(schema, indent, hoisted);
	}

	// `unrepresentable: "any"` in the document generator leaves a bare `{}` for anything Zod could
	// not express. `unknown` is the honest translation.
	return "unknown";
}

function renderObjectBody(schema: JsonSchema, indent: string, hoisted: Map<string, string>): string {
	const properties = isObject(schema.properties) ? schema.properties : {};
	const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set<unknown>();
	const inner = `${indent}\t`;
	const entries = Object.entries(properties);

	if (entries.length === 0) {
		// A record: `{ fields: { [name]: string[] } }` on a validation failure.
		if (isObject(schema.additionalProperties)) {
			return `Record<string, ${renderSchema(schema.additionalProperties, indent, hoisted)}>`;
		}

		return "Record<string, never>";
	}

	const lines = entries.map(([name, rawProperty]) => {
		const property = isObject(rawProperty) ? rawProperty : {};
		const optional = required.has(name) ? "" : "?";
		const rendered = renderSchema(property, inner, hoisted);

		return `${renderDocComment(property.description, inner)}${inner}${name}${optional}: ${rendered};`;
	});

	return `{\n${lines.join("\n")}\n${indent}}`;
}

type Operation = {
	operationId: string;
	method: string;
	path: string;
	tags: string[];
	summary?: string;
	description?: string;
	parameters?: unknown[];
	requestBody?: JsonSchema;
	responses: Record<string, JsonSchema>;
};

function jsonBodyOf(container: unknown): JsonSchema | null {
	if (!isObject(container) || !isObject(container.content)) {
		return null;
	}

	const json = container.content["application/json"];

	return isObject(json) && isObject(json.schema) ? json.schema : null;
}

function collectOperations(document: JsonSchema, tag: string): Operation[] {
	const paths = isObject(document.paths) ? document.paths : {};
	const operations: Operation[] = [];

	// Document order, never sorted: the manifest's order is the order the reference reads in, and
	// re-sorting here would make every regeneration a diff against a human-chosen sequence.
	for (const [path, rawMethods] of Object.entries(paths)) {
		if (!isObject(rawMethods)) {
			continue;
		}

		for (const method of ["get", "post", "patch", "put", "delete"]) {
			const operation = rawMethods[method];

			if (!isObject(operation) || !Array.isArray(operation.tags) || !operation.tags.includes(tag)) {
				continue;
			}

			operations.push({ ...(operation as unknown as Operation), method, path });
		}
	}

	return operations;
}

/** Query parameters, rebuilt into the object schema they were flattened out of. */
function querySchemaOf(operation: Operation): JsonSchema | null {
	const parameters = (operation.parameters ?? []).filter(isObject).filter((p) => p.in === "query");

	if (parameters.length === 0) {
		return null;
	}

	const properties: JsonSchema = {};
	const required: string[] = [];

	for (const parameter of parameters) {
		const name = String(parameter.name);
		properties[name] = isObject(parameter.schema) ? parameter.schema : {};

		if (parameter.required === true) {
			required.push(name);
		}
	}

	return { type: "object", properties, required };
}

/**
 * Names the shapes that appear *inside* more than one operation's schema.
 *
 * Only nested occurrences count. A body or response schema at the root of an operation already gets
 * a name of its own (`DeleteEmailsBody`), so hoisting it would buy an alias and nothing else. What
 * is worth naming is the shape a caller meets in several places without it ever being the whole
 * answer — the message metadata inside `data[]`, inside `results[]` and as a read on its own.
 */
function buildHoistMap(operations: Operation[]): Map<string, string> {
	const totals = new Map<string, number>();
	const nested = new Map<string, number>();

	const visit = (node: unknown, isRoot: boolean): void => {
		if (Array.isArray(node)) {
			for (const item of node) {
				visit(item, false);
			}

			return;
		}

		if (!isObject(node)) {
			return;
		}

		const fingerprint = fingerprintOf(node);

		if (fingerprint !== null) {
			totals.set(fingerprint, (totals.get(fingerprint) ?? 0) + 1);

			if (!isRoot) {
				nested.set(fingerprint, (nested.get(fingerprint) ?? 0) + 1);
			}
		}

		for (const value of Object.values(node)) {
			visit(value, false);
		}
	};

	for (const operation of operations) {
		visit(jsonBodyOf(operation.requestBody), true);
		visit(jsonBodyOf(operation.responses["200"]), true);
		visit(querySchemaOf(operation), true);
	}

	const hoisted = new Map<string, string>();

	for (const [fingerprint, total] of totals) {
		if (total < 2 || (nested.get(fingerprint) ?? 0) === 0) {
			continue;
		}

		const name = sharedShapeNames[fingerprint];

		if (name === undefined) {
			fail(
				`the shape {${fingerprint}} appears ${total} times and has no name.\n` +
					"Add it to `sharedShapeNames` in this script so consumers get a type rather than the shape inlined twice.",
			);
		}

		hoisted.set(fingerprint, name);
	}

	// A name nobody uses is stale configuration that would quietly outlive the shape it described.
	for (const fingerprint of Object.keys(sharedShapeNames)) {
		if (!hoisted.has(fingerprint)) {
			fail(
				`\`sharedShapeNames\` names the shape {${fingerprint}}, but nothing in the shipped tags repeats it.\n` +
					"Remove the entry, or widen `shippedTags` to the resource that used it.",
			);
		}
	}

	return hoisted;
}

/** Finds one occurrence of each hoisted shape so it can be emitted as a standalone type. */
function findHoistedSchemas(operations: Operation[], hoisted: Map<string, string>): Map<string, JsonSchema> {
	const found = new Map<string, JsonSchema>();

	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) {
				visit(item);
			}

			return;
		}

		if (!isObject(node)) {
			return;
		}

		const fingerprint = fingerprintOf(node);

		if (fingerprint !== null && hoisted.has(fingerprint) && !found.has(fingerprint)) {
			found.set(fingerprint, node);
		}

		for (const value of Object.values(node)) {
			visit(value);
		}
	};

	for (const operation of operations) {
		visit(operation.requestBody);
		visit(operation.responses["200"]);
	}

	return found;
}

function collectErrorCodes(operations: Operation[]): string[] {
	const codes = new Set<string>();

	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) {
				visit(item);
			}

			return;
		}

		if (!isObject(node)) {
			return;
		}

		if (isObject(node.properties) && isObject(node.properties.error)) {
			const error = node.properties.error;

			if (typeof error.const === "string") {
				codes.add(error.const);
			}

			if (Array.isArray(error.enum)) {
				for (const value of error.enum) {
					if (typeof value === "string") {
						codes.add(value);
					}
				}
			}
		}

		for (const value of Object.values(node)) {
			visit(value);
		}
	};

	for (const operation of operations) {
		for (const [status, response] of Object.entries(operation.responses)) {
			if (status !== "200") {
				visit(jsonBodyOf(response));
			}
		}
	}

	if (codes.size === 0) {
		fail("no error codes found. The document's failure envelopes should carry an `error` enum.");
	}

	return [...codes].sort();
}

/**
 * The header every generated file carries. No timestamp and no version: either would make every
 * regeneration a diff.
 */
const fileHeader = [
	"// Generated by `bun run generate-api-types`. Do not edit.",
	"// Source: Hashira's published OpenAPI document, via scripts/generate-api-types.ts.",
	"",
].join("\n");

function renderTagFile(operations: Operation[]): string {
	const hoisted = buildHoistMap(operations);
	const hoistedSchemas = findHoistedSchemas(operations, hoisted);
	const blocks: string[] = [fileHeader];

	for (const [fingerprint, schema] of hoistedSchemas) {
		const name = hoisted.get(fingerprint);

		if (name === undefined) {
			continue;
		}

		// Render the body directly: rendering the schema would just resolve back to its own name.
		blocks.push(`export type ${name} = ${renderObjectBody(schema, "", hoisted)};\n`);
	}

	for (const operation of operations) {
		const base = pascalCase(operation.operationId);
		const summary = typeof operation.summary === "string" ? operation.summary : operation.operationId;
		const route = `${operation.method.toUpperCase()} ${operation.path}`;

		const query = querySchemaOf(operation);

		if (query !== null) {
			blocks.push(
				`${renderDocComment(`The query of \`${route}\`.`, "")}export type ${base}Query = ${renderSchema(query, "", hoisted)};\n`,
			);
		}

		const body = jsonBodyOf(operation.requestBody);

		if (body !== null) {
			blocks.push(
				`${renderDocComment(`The body of \`${route}\`.`, "")}export type ${base}Body = ${renderSchema(body, "", hoisted)};\n`,
			);
		}

		const success = operation.responses["200"];
		const successBody = jsonBodyOf(success);

		if (successBody !== null) {
			const responseDescription =
				isObject(success) && typeof success.description === "string" ? success.description : summary;

			blocks.push(
				`${renderDocComment(`${summary}. ${responseDescription}`, "")}export type ${base}Response = ${renderSchema(successBody, "", hoisted)};\n`,
			);
		}
	}

	return blocks.join("\n");
}

function renderErrorCodeFile(codes: string[]): string {
	const union = codes.map((code) => `\t| ${JSON.stringify(code)}`).join("\n");

	return [
		fileHeader,
		"/**",
		" * Every stable code the operations this SDK exposes can answer with.",
		" *",
		" * The codes are identifiers, not display copy: map them to your own wording rather than showing",
		" * them to a customer. The union widens with `(string & {})` so a code added to the API after this",
		" * version was published still type-checks — a client that switches on it keeps compiling.",
		" */",
		"export type HashiraErrorCode =",
		union,
		"\t// biome-ignore lint/complexity/noBannedTypes: this is the standard widening that keeps",
		"\t// autocomplete while still accepting a code newer than this release.",
		"\t| (string & {});",
		"",
	].join("\n");
}

async function formatWithBiome(relativePath: string, source: string): Promise<string> {
	// Biome is the formatter, not this script: piping through the repo's own config means the
	// generated files can never fail `bun run check`, and no tab-or-110-columns rule is restated here.
	// The binary is the one this package installed, so the format can never drift from the pinned
	// version the rest of the repo checks with.
	const biomeBinary = new URL("../node_modules/.bin/biome", import.meta.url).pathname;
	const input = new TextEncoder().encode(source);

	const result = await Bun.$`${biomeBinary} check --write --stdin-file-path=${relativePath} < ${input}`
		.quiet()
		.nothrow();

	if (result.exitCode !== 0) {
		fail(`Biome could not format ${relativePath}:\n${result.stderr.toString()}`);
	}

	return result.stdout.toString();
}

async function render(): Promise<Map<string, string>> {
	let response: Response;

	try {
		response = await fetch(documentUrl);
	} catch (error) {
		fail(`could not reach ${documentUrl}: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (!response.ok) {
		fail(`${documentUrl} answered ${response.status}. It should serve the OpenAPI document to anyone.`);
	}

	const document = (await response.json()) as JsonSchema;
	const rendered = new Map<string, string>();
	const allOperations: Operation[] = [];

	for (const tag of shippedTags) {
		const operations = collectOperations(document, tag);

		if (operations.length === 0) {
			fail(`tag "${tag}" has no operations in the document. Is it spelled the way apiTags spells it?`);
		}

		allOperations.push(...operations);

		const fileName = `${tag.toLowerCase()}.gen.ts`;
		rendered.set(fileName, await formatWithBiome(`src/generated/${fileName}`, renderTagFile(operations)));
	}

	rendered.set(
		"error-codes.gen.ts",
		await formatWithBiome(
			"src/generated/error-codes.gen.ts",
			renderErrorCodeFile(collectErrorCodes(allOperations)),
		),
	);

	return rendered;
}

async function main(): Promise<void> {
	const checkOnly = process.argv.includes("--check");
	const rendered = await render();
	const drifted: string[] = [];

	for (const [fileName, contents] of rendered) {
		const target = new URL(fileName, generatedDirectoryUrl);

		if (!checkOnly) {
			await Bun.write(target, contents);
			continue;
		}

		const existing = Bun.file(target);
		const current = (await existing.exists()) ? await existing.text() : null;

		if (current !== contents) {
			drifted.push(fileName);
		}
	}

	if (!checkOnly) {
		console.log(`Wrote ${rendered.size} files to src/generated from ${shippedTags.length} tag(s).`);
		return;
	}

	if (drifted.length > 0) {
		console.error(
			`generate-api-types: ${drifted.length} generated file(s) no longer match the API document:\n` +
				drifted.map((file) => `  src/generated/${file}`).join("\n") +
				"\n\nRun `bun run generate-api-types` and commit the result.",
		);
		process.exit(1);
	}

	console.log(`Checked ${rendered.size} generated file(s): up to date.`);
}

await main();
