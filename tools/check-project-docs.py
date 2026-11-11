"""Read-only documentation, skill-discovery and local evidence checks."""
from pathlib import Path
import argparse, hashlib, json, re, sys
from urllib.parse import unquote

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path);ap.add_argument('--fallback-root',type=Path);args=ap.parse_args()
    root=(args.root or Path(__file__).resolve().parents[1]).resolve()
    fallback=args.fallback_root.resolve() if args.fallback_root else None
    errors=[];links=0;files=[]
    for name in ['README.md','AGENTS.md']:
        p=root/name
        if not p.exists():errors.append('Missing '+name)
        else:files.append(p)
    for folder in ['docs','.agents/skills']:
        p=root/folder
        if p.exists():files.extend(p.rglob('*.md'))
    def exists(path):
        if path.exists():return True
        if fallback and path.is_relative_to(root):return (fallback/path.relative_to(root)).exists()
        return False
    for p in files:
        body=p.read_text(encoding='utf8')
        for href in re.findall(r'(?<!!)\[[^\]]*\]\(([^\n)]+)\)',body):
            href=href.strip().strip('<>').split('#',1)[0]
            if not href or re.match(r'^(https?|mailto|app|plugin|skill):',href):continue
            if re.match(r'^[A-Za-z]:',href) or href.startswith('/'):continue
            candidate=(p.parent/unquote(href)).resolve();links+=1
            if not exists(candidate):errors.append(f'{p.relative_to(root)}: missing relative link {href}')
    skills=list((root/'.agents/skills').glob('*/SKILL.md'))
    expected={'material-flow-project','material-flow-cad-extraction','material-flow-knowledge-maintenance'}
    if {p.parent.name for p in skills}!=expected:errors.append('Project skill discovery set differs from the documented inventory')
    for p in skills:
        body=p.read_text(encoding='utf8');parts=body.split('---',2)
        if len(parts)<3 or parts[0].strip():errors.append(str(p)+': invalid frontmatter');continue
        m=re.search(r'^name:\s*(\S+)\s*$',parts[1],re.M)
        if not m or m.group(1)!=p.parent.name:errors.append(str(p)+': skill name/folder mismatch')
        if not re.search(r'^description:\s*\S',parts[1],re.M):errors.append(str(p)+': missing discovery description')
    package=(fallback or root)/'dist/SEEG_Y26_AI_Package'
    evidence='local package absent; documentation-only check'
    if (package/'verification.json').exists():
        v=json.loads((package/'verification.json').read_text(encoding='utf8'))
        b=json.loads((package/'build_report.json').read_text(encoding='utf8'))
        if v.get('status')!='pass' or not v.get('dxf_sqlite_counts_match'):errors.append('Local data verification has not passed')
        if v.get('text_labels')!=b.get('sqlite_text_labels'):errors.append('Local evidence label counts disagree')
        if v.get('sheet_data_rows')!=b.get('sheet_data_rows'):errors.append('Local evidence worksheet counts disagree')
        if not all(s.get('unchanged') for s in v.get('source_hashes',[])):errors.append('Source preservation evidence missing')
        n=json.loads((package/'native_excel_render.json').read_text(encoding='utf8'))
        digest=hashlib.sha256((package/'SEEG_Y26_Layout_Readable.xlsx').read_bytes()).hexdigest()
        if n.get('workbook_sha256')!=digest:errors.append('Native Excel receipt belongs to a different workbook')
        if any(r.get('nasca_protected') for r in n.get('previews',[])) and n.get('visual_review')=='pass':errors.append('Protected native exports incorrectly claimed visual acceptance')
        evidence='local package data receipts agree; visual/PDF limits remain separate'
    result={'status':'pass' if not errors else 'fail','markdown_files':len(files),'relative_links':links,'skills':len(skills),'local_evidence':evidence,'errors':errors}
    print(json.dumps(result,indent=2));return 0 if not errors else 1

if __name__=='__main__':sys.exit(main())
