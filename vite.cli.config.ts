import { defineConfig } from 'vite';

// Second point d'entrée du build : le binaire `ape`, sans SvelteKit.
export default defineConfig({
	build: {
		ssr: 'src/cli/ape.ts',
		outDir: 'build/cli',
		emptyOutDir: false,
		target: 'node26',
		rollupOptions: {
			output: { entryFileNames: 'ape.js', format: 'es' }
		}
	},
	ssr: { noExternal: [] }
});
