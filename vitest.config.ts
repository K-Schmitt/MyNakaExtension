import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, ".claude/**"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			reporter: ["text-summary", "json-summary", "html"],
			reportsDirectory: "coverage",
		},
	},
});
