import { CONTEXT_MAX_BYTES, validateContextFile } from '../../client/src/components/bencho/upload-context';
describe('真实上下文文件校验', () => {
  it.each(['a.txt', 'a.md', 'a.markdown', 'a.json', 'a.csv', 'A.TXT'])('接受 %s', name => {
    expect(validateContextFile({ name, size: 100 }, [], 0)).toBeNull();
  });
  it('拒绝超过 2MB、空文件、非文本格式以及超过五个文件', () => {
    expect(validateContextFile({ name: 'a.txt', size: CONTEXT_MAX_BYTES }, [], 0)).toBeNull();
    expect(validateContextFile({ name: 'a.txt', size: CONTEXT_MAX_BYTES + 1 }, [], 0)).toContain('2MB');
    expect(validateContextFile({ name: 'a.txt', size: 0 }, [], 0)).toContain('空文件');
    expect(validateContextFile({ name: 'a.exe', size: 100 }, [], 0)).toContain('格式不支持');
    expect(validateContextFile({ name: 'a.md', size: 100 }, [], 5)).toContain('最多添加 5');
  });
  it('同名文件不静默覆盖或造成删除多项', () => {
    expect(validateContextFile({ name: 'a.txt', size: 100 }, ['a.txt'], 1)).toContain('已添加');
  });
});
