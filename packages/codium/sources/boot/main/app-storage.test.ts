import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'
import { happyHomeDir, happyHomeName } from './app-storage'

describe('Happy app storage paths', () => {
    it('uses capital Happy on macOS and Windows', () => {
        expect(happyHomeName('darwin')).toBe('Happy')
        expect(happyHomeName('win32')).toBe('Happy')
        expect(happyHomeDir('darwin', join(sep, 'Users', 'alice'))).toBe(join(sep, 'Users', 'alice', 'Happy'))
        expect(happyHomeDir('win32', join(sep, 'Users', 'alice'))).toBe(join(sep, 'Users', 'alice', 'Happy'))
    })

    it('uses lowercase happy on Linux', () => {
        expect(happyHomeName('linux')).toBe('happy')
        expect(happyHomeDir('linux', join(sep, 'home', 'alice'))).toBe(join(sep, 'home', 'alice', 'happy'))
    })
})
