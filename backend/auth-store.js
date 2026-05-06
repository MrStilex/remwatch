import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const dir  = dirname(fileURLToPath(import.meta.url))
const FILE = `${dir}/data/auth.json`

function read() {
  if (!existsSync(FILE)) return null
  try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return null }
}

function write(data) {
  mkdirSync(dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

// Возвращает текущий хэш пароля (файл → env → null)
export function getPasswordHash() {
  return read()?.passwordHash ?? process.env.ADMIN_PASSWORD_HASH ?? null
}

// true если пароль ещё не менялся
export function isFirstLogin() {
  return read()?.firstLogin !== false
}

// Сохраняет новый хэш и снимает флаг первого входа
export function saveNewPassword(hash) {
  write({ passwordHash: hash, firstLogin: false })
}
