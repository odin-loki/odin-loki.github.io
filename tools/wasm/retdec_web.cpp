/* =============================================================
   RetDec Imortek — the decoder, in the browser.

   The first rung of the ladder on /retdec.html is turning bytes
   into instructions. That job belongs to Capstone, which is the
   same disassembler the native RetDec build uses (deps/capstone,
   pinned at 5.x), and it is pure C with no dependencies — so it
   compiles to WebAssembly whole.

   The rungs above it — lifting to LLVM IR, structuring, naming the
   algorithm — are LLVM's work, and LLVM is not shippable to a web
   page at any size. This is deliberately only the decoder, and the
   page says so rather than implying the whole pipeline is here.
   ============================================================= */
#include <capstone/capstone.h>

#include <cstdio>
#include <cstring>
#include <string>

#include <emscripten/emscripten.h>

namespace {
std::string g_out;

/* "48 89 e5" or "4889e5" or "0x48,0x89" — accept what a person pastes. */
size_t parse_hex(const char* text, unsigned char* out, size_t cap) {
    size_t n = 0;
    int hi = -1;
    for (const char* p = text; *p && n < cap; ++p) {
        int v;
        if (*p >= '0' && *p <= '9') v = *p - '0';
        else if (*p >= 'a' && *p <= 'f') v = *p - 'a' + 10;
        else if (*p >= 'A' && *p <= 'F') v = *p - 'A' + 10;
        else { hi = -1; continue; }
        if (hi < 0) hi = v;
        else { out[n++] = static_cast<unsigned char>((hi << 4) | v); hi = -1; }
    }
    return n;
}
} // namespace

extern "C" {

/* Disassemble hex bytes. mode: 32 or 64. Returns one instruction per line,
   "address\tmnemonic\toperands", or a line starting with "!" on failure. */
EMSCRIPTEN_KEEPALIVE
const char* rd_web_disasm(const char* hex, int bits, unsigned int base) {
    unsigned char code[4096];
    const size_t n = parse_hex(hex ? hex : "", code, sizeof(code));
    if (n == 0) { g_out = "!no bytes to decode"; return g_out.c_str(); }

    csh handle;
    const cs_mode mode = (bits == 32) ? CS_MODE_32 : CS_MODE_64;
    if (cs_open(CS_ARCH_X86, mode, &handle) != CS_ERR_OK) {
        g_out = "!capstone failed to open";
        return g_out.c_str();
    }

    cs_insn* insn = nullptr;
    const size_t count = cs_disasm(handle, code, n, base, 0, &insn);
    g_out.clear();
    if (count == 0) {
        g_out = "!nothing decoded — not valid x86 at this width";
    } else {
        char line[512];
        for (size_t i = 0; i < count; ++i) {
            std::snprintf(line, sizeof(line), "0x%08llx\t%s\t%s\n",
                          static_cast<unsigned long long>(insn[i].address),
                          insn[i].mnemonic, insn[i].op_str);
            g_out += line;
        }
        cs_free(insn, count);
    }
    cs_close(&handle);
    return g_out.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* rd_web_version() {
    static std::string v;
    int major = 0, minor = 0;
    cs_version(&major, &minor);
    v = "Capstone " + std::to_string(major) + "." + std::to_string(minor);
    return v.c_str();
}

} // extern "C"
