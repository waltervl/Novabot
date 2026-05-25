# Ghidra headless postScript: decompile the functions that implement
# map_generator.cpp (the mower occupancy-grid generator). Targets functions
# that reference any "map_generator.cpp" string, plus their direct callees,
# so we get the grid-construction + dilate logic without dumping the whole
# 1.5MB ROS2 binary. Output: research/ghidra_output/mapgen_decompiled.c
#@category Novabot
from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor

prog = currentProgram
fm = prog.getFunctionManager()
listing = prog.getListing()
refmgr = prog.getReferenceManager()
monitor = ConsoleTaskMonitor()

di = DecompInterface()
di.openProgram(prog)

seed = set()
for d in listing.getDefinedData(True):
    try:
        v = d.getValue()
    except:
        v = None
    if v is not None and 'map_generator' in str(v):
        for ref in refmgr.getReferencesTo(d.getAddress()):
            f = fm.getFunctionContaining(ref.getFromAddress())
            if f is not None:
                seed.add(f)

# include direct callees of the seed functions (the dilate/raster helpers)
funcs = set(seed)
for f in list(seed):
    for c in f.getCalledFunctions(monitor):
        funcs.add(c)

out_path = '/Users/rvbcrs/GitHub/Novabot/research/ghidra_output/mapgen_decompiled.c'
out = open(out_path, 'w')
out.write('// novabot_mapping map_generator.cpp — decompiled (seed=%d, +callees=%d)\n\n' % (len(seed), len(funcs)))
n = 0
for f in sorted(funcs, key=lambda x: x.getEntryPoint().getOffset()):
    res = di.decompileFunction(f, 90, monitor)
    if res is not None and res.decompileCompleted():
        out.write('// ===== %s @ %s =====\n' % (f.getName(), f.getEntryPoint()))
        out.write(res.getDecompiledFunction().getC())
        out.write('\n\n')
        n += 1
out.close()
print('[decompile_mapgen] wrote %d functions to %s' % (n, out_path))
