import { load as loadYaml } from "js-yaml";
import { isVisibleString } from "utils";

export interface ProgramFrontmatter {
	id: string;
	name: string;
	author?: string;
	url?: string;
	shortDescription?: string;
	isMultiweek?: boolean;
	tags?: string[];
	frequency?: number;
	age?: string;
	duration?: string;
	goal?: string;
}

export interface ProgramDoc extends ProgramFrontmatter {
	/** The slug taken from the markdown filename (without extension). */
	slug: string;
	/** The raw markdown body with frontmatter and the liftoscript block removed. */
	markdown: string;
	/** The extracted liftoscript program text (contents of the ```liftoscript``` fence). */
	liftoscript: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const LIFTOSCRIPT_FENCE_RE = /```liftoscript\r?\n([\s\S]*?)```/;

function parseFrontmatter(raw: string): {
	data: Partial<ProgramFrontmatter>;
	body: string;
} {
	const match = raw.match(FRONTMATTER_RE);
	if (!match) {
		return { data: {}, body: raw };
	}
	let data: Partial<ProgramFrontmatter> = {};
	try {
		data = (loadYaml(match[1]) as Partial<ProgramFrontmatter>) ?? {};
	} catch {
		data = {};
	}
	return { data, body: raw.slice(match[0].length) };
}

function extractLiftoscript(body: string): {
	liftoscript: string;
	markdown: string;
} {
	const match = body.match(LIFTOSCRIPT_FENCE_RE);
	if (!match) {
		return { liftoscript: "", markdown: body };
	}
	return {
		liftoscript: match[1].replace(/\s+$/, ""),
		markdown: body.replace(match[0], "").trim(),
	};
}

function slugFromPath(path: string): string {
	const file = path.split("/").pop() ?? path;
	return file.replace(/\.md$/, "");
}

function buildDoc(path: string, raw: string): ProgramDoc {
	const slug = slugFromPath(path);
	const { data, body } = parseFrontmatter(raw);
	const { liftoscript, markdown } = extractLiftoscript(body);
	return {
		slug,
		id: data.id ?? slug,
		name: data.name ?? slug,
		author: data.author,
		url: data.url,
		shortDescription: data.shortDescription,
		isMultiweek: data.isMultiweek,
		tags: data.tags,
		frequency: data.frequency,
		age: data.age,
		duration: data.duration,
		goal: data.goal,
		markdown,
		liftoscript,
	};
}

const modules = import.meta.glob<string>("../programs/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
});

export const programs: ProgramDoc[] = Object.entries(modules)
	.map(([path, raw]) => buildDoc(path, raw))
	.filter(doc => doc.liftoscript.length > 0)
	.sort((a, b) => a.name.localeCompare(b.name));

const programsBySlug = new Map(programs.map(p => [p.slug, p]));

export function getProgram(slug: string): ProgramDoc | undefined {
	return programsBySlug.get(slug);
}

/** The distinct values present for a given frontmatter facet, for building filters. */
export function facetValues(key: "goal" | "age" | "duration" | "frequency"): string[] {
	return Array.from(new Set<string>(programs.map(p => p[key]).filter(isVisibleString))).sort();
}
