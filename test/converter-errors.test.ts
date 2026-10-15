import { describe, it, expect, vi } from 'vitest';

const { generatorError } = vi.hoisted(() => ({ generatorError: new Error('generator exploded') }));
vi.mock('@turbodocx/html-to-docx', () => ({
  default: vi.fn().mockRejectedValue(generatorError),
}));

import { convertMarkdownToWord } from '../src/converter';

describe('when the generator fails', () => {
  it('rejects with a message the app can show, keeping the original error as the cause', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const conversion = convertMarkdownToWord('# Title\n');

    await expect(conversion).rejects.toThrow('Failed to generate Word document');
    await expect(conversion).rejects.toHaveProperty('cause', generatorError);
    expect(consoleError).toHaveBeenCalled();
  });
});
