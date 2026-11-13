import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [a,b]=process.argv.slice(2);if(!a||!b)throw new Error('same <a> <b>');
const A=readFileSync(a),B=readFileSync(b),hash=x=>createHash('sha256').update(x).digest('hex');
if(A.equals(B))console.log('identical '+hash(A));
else{let i=0;while(i<Math.min(A.length,B.length)&&A[i]===B[i])i++;console.log(hash(A)+' '+a+'\n'+hash(B)+' '+b+'\nfirst differing byte '+i);for(const x of [A,B])console.log(JSON.stringify(x.subarray(Math.max(0,i-40),i+40).toString('utf8')));process.exitCode=1;}
