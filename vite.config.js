import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const root = (p) => fileURLToPath(new URL(p, import.meta.url)).replace(/\\/g, '/')

// 变量文件绝对路径，供 less 全局注入
const variablesPath = root('./src/styles/variables.less')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      less: {
        // 允许在 less 中使用 JS 表达式
        javascriptEnabled: true,
        // 全局注入变量与混入，所有 less 文件可直接使用，无需重复 import
        additionalData: `@import "${variablesPath}";\n`
      }
    }
  },
  resolve: {
    alias: {
      '@': root('./src')
    }
  },
  optimizeDeps: {
    // 显式声明重型依赖，启动时一次性预构建，避免运行中反复 re-optimize
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'three',
      '@react-three/fiber',
      '@react-three/drei'
    ]
  },
  server: {
    port: 5173,
    host: true,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
