// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 dlazarus
/**
 * pi-roles — extensión de roles
 *
 * Carga roles desde PI_ROLES_DIR; si no está definida, usa ~/.pi/roles
 * como directorio por defecto.
 * Cada archivo .md o .txt es un rol (nombre = archivo sin extensión).
 * Frontmatter opcional al inicio del archivo:
 *
 *   ---
 *   provider: llama-server=http://127.0.0.1:8080
 *   modelo: models/Qwen3.8-27B-UD-Q4_K_XL.gguf
 *   pensamiento: high                    # off|minimal|low|medium|high|xhigh|max
 *   herramientas: read,ls                # lista separada por comas; vacía = sin herramientas
 *   modo: reemplazar                     # reemplazar (default) | agregar
 *   ---
 *   Eres un tutor...
 *
 * "reemplazar" sustituye por completo el system prompt de pi (conversación
 * pura, sin identidad de coding). "agregar" lo añade al final conservando
 * herramientas y contexto de pi (úsalo si el rol necesita tools).
 *
 * Uso:  pi --rol Logix   |   /rol   |   /rol Dr.Qwen
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface Rol {
	nombre: string;
	provider?: string;
	modelo?: string;
	pensamiento?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	herramientas?: string[];
	modo: "reemplazar" | "agregar";
	contenido: string;
}

function dirRoles(): string {
	if (process.env.PI_ROLES_DIR) return process.env.PI_ROLES_DIR;
	return join(homedir(), ".pi", "roles");
}

function parseRol(nombre: string, raw: string): Rol {
	let front: Record<string, string> = {};
	let contenido = raw;
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (m) {
		for (const line of m[1].split(/\r?\n/)) {
			const idx = line.indexOf(":");
			if (idx > 0) front[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
		contenido = raw.slice(m[0].length);
	}
	return {
		nombre,
		provider: front["provider"],
		modelo: front["modelo"],
		pensamiento: front["pensamiento"] as Rol["pensamiento"],
		herramientas: Object.prototype.hasOwnProperty.call(front, "herramientas")
			? front["herramientas"].split(",").map((s) => s.trim()).filter(Boolean)
			: undefined,
		modo: front["modo"] === "agregar" ? "agregar" : "reemplazar",
		contenido: contenido.trim(),
	};
}

function loadRoles(): Record<string, Rol> {
	const roles: Record<string, Rol> = {};
	const dir = dirRoles();
	if (!existsSync(dir)) return roles;
	for (const file of readdirSync(dir).filter((f) => f.endsWith(".md") || f.endsWith(".txt")).sort()) {
		const nombre = file.slice(0, file.lastIndexOf("."));
		roles[nombre] = parseRol(nombre, readFileSync(join(dir, file), "utf-8"));
	}
	return roles;
}

export default function (pi: ExtensionAPI) {
	let roles: Record<string, Rol> = {};
	let activo: Rol | undefined;

	async function aplicarRol(rol: Rol, ctx: ExtensionContext): Promise<void> {
		if (rol.provider && rol.modelo) {
			const model = ctx.modelRegistry.find(rol.provider, rol.modelo);
			if (model) {
				const ok = await pi.setModel(model);
				if (!ok) ctx.ui.notify(`Rol "${rol.nombre}": sin credenciales para ${rol.provider}/${rol.modelo}`, "warning");
			} else {
				ctx.ui.notify(`Rol "${rol.nombre}": modelo ${rol.modelo} no encontrado en ${rol.provider}`, "warning");
			}
		}
		if (rol.pensamiento) pi.setThinkingLevel(rol.pensamiento);
		if (rol.herramientas !== undefined) pi.setActiveTools(rol.herramientas);
		activo = rol;
		ctx.ui.setStatus("rol", ctx.ui.theme.fg("accent", `rol: ${rol.nombre}`));
	}

	pi.registerFlag("rol", { description: "Rol con el que arrancar la sesión", type: "string" });

	pi.registerCommand("rol", {
		description: "Ver o cambiar el rol activo",
		handler: async (args, ctx) => {
			roles = loadRoles();
			const nombres = Object.keys(roles);
			if (nombres.length === 0) {
				ctx.ui.notify(`Sin roles en ${dirRoles()}`, "warning");
				return;
			}
			let nombre: string | null;
			if (args?.trim()) {
				nombre = args.trim();
			} else {
				nombre = await ctx.ui.select("Rol activo:", [...nombres, "(ninguno)"]);
			}
			if (nombre === null) return;
			if (nombre === "(ninguno)") {
				activo = undefined;
				ctx.ui.setStatus("rol", undefined);
				ctx.ui.notify("Rol despejado (system prompt por defecto de pi)", "info");
				return;
			}
			const rol = roles[nombre];
			if (!rol) {
				ctx.ui.notify(`Rol desconocido "${nombre}". Disponibles: ${nombres.join(", ")}`, "error");
				return;
			}
			await aplicarRol(rol, ctx);
			ctx.ui.notify(`Rol "${rol.nombre}" activo`, "info");
		},
	});

	// Inyecta el prompt del rol en cada turno
	pi.on("before_agent_start", async (event) => {
		if (!activo) return;
		if (activo.modo === "agregar") {
			return { systemPrompt: `${event.systemPrompt}\n\n${activo.contenido}` };
		}
		return { systemPrompt: activo.contenido };
	});

	pi.on("session_start", async (_event, ctx) => {
		roles = loadRoles();

		// 1) Flag --rol
		const flag = pi.getFlag("rol");
		if (typeof flag === "string" && flag) {
			const rol = roles[flag];
			if (rol) {
				await aplicarRol(rol, ctx);
				ctx.ui.notify(`Rol "${rol.nombre}" activo`, "info");
			} else {
				ctx.ui.notify(`Rol desconocido "${flag}". Disponibles: ${Object.keys(roles).join(", ") || "(ninguno)"}`, "warning");
			}
			return;
		}

		// 2) Restaurar rol persistido (tras /resume)
		const saved = ctx.sessionManager
			.getEntries()
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "pi-rol")
			.pop() as { data?: { nombre: string } } | undefined;
		if (saved?.data?.nombre && roles[saved.data.nombre]) {
			activo = roles[saved.data.nombre];
			ctx.ui.setStatus("rol", ctx.ui.theme.fg("accent", `rol: ${activo.nombre}`));
		}
	});

	// Persistir el rol activo para que /resume lo recupere
	pi.on("turn_start", () => {
		if (activo) pi.appendEntry("pi-rol", { nombre: activo.nombre });
	});
}
