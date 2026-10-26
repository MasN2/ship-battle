"""Checks js/zero.js and train.py compute the same net: a random net plays a few self-play games
in node, then torch recomputes every recorded move's log-probability and value from the data.
    python tools/zero/parity.py"""
import os, sys, json, tempfile, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import ZeroNet, export, load_batch, minibatch_inputs, seg_logsoftmax, node

d = tempfile.mkdtemp()
torch.manual_seed(0)
net = ZeroNet()
with torch.no_grad():  # sharper than the near-uniform start, so differences would show
    net.po.weight.mul_(100); net.v2.weight.mul_(10)
export(net, os.path.join(d, 'net.json'))
r = node(['tools/zero/selfplay.js', '--net', os.path.join(d, 'net.json'), '--games', '40', '--out', os.path.join(d, 'b'), '--vary', '0.7', '--threads', '8'])
print(r.stdout.strip(), r.stderr.strip())
A = load_batch(os.path.join(d, 'b'), 'cpu')
mb = torch.arange(A['N'])
with torch.no_grad():
    B, sx, ss, g, ax, aseg, ch = minibatch_inputs(A, mb)
    logits, value = net(B, sx, ss, g, ax, aseg)
    logp = seg_logsoftmax(logits, aseg, B)[ch]
dl = (logp - A['s_logp']).abs()
dv = (value - A['s_value']).abs()
print(f"samples {A['N']}  max |dlogp| {dl.max():.2e}  max |dvalue| {dv.max():.2e}  mean logp {A['s_logp'].mean():.3f}")
sys.exit(0 if dl.max() < 1e-3 and dv.max() < 1e-4 else 1)
