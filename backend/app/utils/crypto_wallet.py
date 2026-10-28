"""BIP-39 / BIP-32 / BIP-44 Self-Custody Crypto Wallet Generator for EVM (BEP-20, Polygon) and TRON (TRC-20).

Generates a single 12-word BIP-39 mnemonic seed phrase and deterministically derives:
- EVM account at m/44'/60'/0'/0/0 (compatible with Trust Wallet, MetaMask, OKX Wallet for BSC BEP-20 & Polygon)
- TRON account at m/44'/195'/0'/0/0 (compatible with Trust Wallet, TronLink, OKX Wallet for TRON TRC-20)

Zero external native dependencies beyond standard library + `cryptography` (SECP256K1).
"""

from __future__ import annotations

from functools import lru_cache
import hashlib
import hmac
from pathlib import Path
import secrets
import struct
from typing import TypedDict

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

# secp256k1 curve order N
SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
HARDENED_OFFSET = 0x80000000
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

# Keccak-f[1600] constants (original pre-NIST Keccak-256 used by Ethereum and TRON)
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]

_ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]


def _rol64(val: int, shift: int) -> int:
    return ((val << shift) | (val >> (64 - shift))) & 0xFFFFFFFFFFFFFFFF


def keccak256(data: bytes) -> bytes:
    """Compute original Keccak-256 digest (0x01 domain separator, 136-byte rate)."""
    rate = 136  # 1088 bits
    state = [0] * 25

    # Pad with 0x01 ... 0x80
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % rate != 0:
        padded.append(0x00)
    padded[-1] |= 0x80

    for offset in range(0, len(padded), rate):
        block = padded[offset : offset + rate]
        for i in range(rate // 8):
            lane = struct.unpack_from("<Q", block, i * 8)[0]
            state[i] ^= lane

        # 24 rounds of Keccak-f[1600]
        for r in range(24):
            # Theta
            c = [state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20] for x in range(5)]
            d = [c[(x - 1) % 5] ^ _rol64(c[(x + 1) % 5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    state[x + 5 * y] ^= d[x]

            # Rho & Pi
            b = [0] * 25
            for x in range(5):
                for y in range(5):
                    b[y + 5 * ((2 * x + 3 * y) % 5)] = _rol64(state[x + 5 * y], _ROT[x][y])

            # Chi
            for x in range(5):
                for y in range(5):
                    state[x + 5 * y] = b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])

            # Iota
            state[0] ^= _RC[r]

    out = bytearray(32)
    for i in range(4):
        struct.pack_into("<Q", out, i * 8, state[i])
    return bytes(out)


@lru_cache(maxsize=1)
def get_bip39_wordlist() -> list[str]:
    """Load the official 2048-word BIP-39 English wordlist."""
    path = Path(__file__).resolve().parent.parent / "resources" / "bip39_english.txt"
    words = [w.strip() for w in path.read_text(encoding="utf-8").splitlines() if w.strip()]
    if len(words) != 2048:
        raise RuntimeError(f"Invalid BIP-39 wordlist length: {len(words)}")
    return words


def generate_bip39_mnemonic(strength_bits: int = 128) -> str:
    """Generate a cryptographically secure 12-word BIP-39 mnemonic phrase."""
    if strength_bits not in (128, 256):
        raise ValueError("strength_bits must be 128 (12 words) or 256 (24 words)")
    entropy = secrets.token_bytes(strength_bits // 8)
    return entropy_to_mnemonic(entropy)


def entropy_to_mnemonic(entropy: bytes) -> str:
    """Convert raw entropy bytes into a checksummed BIP-39 mnemonic string."""
    words = get_bip39_wordlist()
    ent_bits = len(entropy) * 8
    checksum_bits = ent_bits // 32

    hash_bytes = hashlib.sha256(entropy).digest()
    ent_int = int.from_bytes(entropy, "big")
    cs_int = hash_bytes[0] >> (8 - checksum_bits)
    combined = (ent_int << checksum_bits) | cs_int
    total_bits = ent_bits + checksum_bits
    word_count = total_bits // 11

    mnemonic_words: list[str] = []
    for i in range(word_count):
        shift = total_bits - 11 * (i + 1)
        idx = (combined >> shift) & 0x7FF
        mnemonic_words.append(words[idx])

    return " ".join(mnemonic_words)


def mnemonic_to_seed(mnemonic: str, passphrase: str = "") -> bytes:
    """Derive 64-byte BIP-39 seed from mnemonic and optional passphrase."""
    normalized_mnemonic = " ".join(mnemonic.strip().split())
    salt = ("mnemonic" + passphrase).encode("utf-8")
    return hashlib.pbkdf2_hmac(
        "sha512",
        normalized_mnemonic.encode("utf-8"),
        salt,
        2048,
        dklen=64,
    )


def _privkey_to_compressed_pubkey(priv_int: int) -> bytes:
    priv_key = ec.derive_private_key(priv_int, ec.SECP256K1())
    return priv_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.CompressedPoint,
    )


def _privkey_to_uncompressed_pubkey(priv_int: int) -> bytes:
    priv_key = ec.derive_private_key(priv_int, ec.SECP256K1())
    return priv_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )


def derive_bip32_private_key(seed: bytes, path_indices: list[int]) -> bytes:
    """Derive 32-byte private key along a BIP-32 path from a 64-byte seed."""
    i_master = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    k_priv = int.from_bytes(i_master[:32], "big")
    chain_code = i_master[32:]

    for index in path_indices:
        if index >= HARDENED_OFFSET:
            data = b"\x00" + k_priv.to_bytes(32, "big") + struct.pack(">I", index)
        else:
            pub_compressed = _privkey_to_compressed_pubkey(k_priv)
            data = pub_compressed + struct.pack(">I", index)

        i_child = hmac.new(chain_code, data, hashlib.sha512).digest()
        il_int = int.from_bytes(i_child[:32], "big")
        k_priv = (il_int + k_priv) % SECP256K1_N
        chain_code = i_child[32:]

    return k_priv.to_bytes(32, "big")


def to_eip55_checksum_address(addr_hex_lower: str) -> str:
    """Format a 40-char hex EVM address with EIP-55 mixed-case checksum."""
    raw = addr_hex_lower.lower().removeprefix("0x")
    digest_hex = keccak256(raw.encode("ascii")).hex()
    out = ["0x"]
    for ch, h_ch in zip(raw, digest_hex):
        if ch in "abcdef" and int(h_ch, 16) >= 8:
            out.append(ch.upper())
        else:
            out.append(ch)
    return "".join(out)


def base58check_encode(payload: bytes) -> str:
    """Encode bytes using Base58Check (double SHA-256 4-byte checksum)."""
    checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    data = payload + checksum
    num = int.from_bytes(data, "big")
    encoded = []
    while num > 0:
        num, rem = divmod(num, 58)
        encoded.append(BASE58_ALPHABET[rem])
    for byte in data:
        if byte == 0:
            encoded.append(BASE58_ALPHABET[0])
        else:
            break
    return "".join(reversed(encoded))


def private_key_to_evm_address(priv_key_bytes: bytes) -> str:
    """Derive EIP-55 checksummed EVM address (0x...) from 32-byte private key."""
    priv_int = int.from_bytes(priv_key_bytes, "big")
    uncompressed = _privkey_to_uncompressed_pubkey(priv_int)
    # Strip 0x04 prefix (64 bytes remaining) and hash with Keccak-256
    pub_hash = keccak256(uncompressed[1:])
    addr_hex = pub_hash[-20:].hex()
    return to_eip55_checksum_address(addr_hex)


def private_key_to_tron_address(priv_key_bytes: bytes) -> str:
    """Derive TRON Base58Check address (T...) from 32-byte private key."""
    priv_int = int.from_bytes(priv_key_bytes, "big")
    uncompressed = _privkey_to_uncompressed_pubkey(priv_int)
    pub_hash = keccak256(uncompressed[1:])
    # TRON mainnet prefix is 0x41 followed by the last 20 bytes of Keccak-256(pubkey)
    tron_raw = b"\x41" + pub_hash[-20:]
    return base58check_encode(tron_raw)


class MasterCryptoWallet(TypedDict):
    mnemonic: str
    evm_address: str
    evm_private_key: str
    tron_address: str
    tron_private_key: str


def derive_wallet_from_mnemonic(mnemonic: str) -> MasterCryptoWallet:
    """Derive both EVM (BEP-20 / Polygon) and TRON (TRC-20) keys & addresses from a BIP-39 mnemonic."""
    seed = mnemonic_to_seed(mnemonic)

    # EVM path: m/44'/60'/0'/0/0
    evm_path = [
        44 + HARDENED_OFFSET,
        60 + HARDENED_OFFSET,
        0 + HARDENED_OFFSET,
        0,
        0,
    ]
    evm_priv = derive_bip32_private_key(seed, evm_path)
    evm_address = private_key_to_evm_address(evm_priv)

    # TRON path: m/44'/195'/0'/0/0
    tron_path = [
        44 + HARDENED_OFFSET,
        195 + HARDENED_OFFSET,
        0 + HARDENED_OFFSET,
        0,
        0,
    ]
    tron_priv = derive_bip32_private_key(seed, tron_path)
    tron_address = private_key_to_tron_address(tron_priv)

    return {
        "mnemonic": " ".join(mnemonic.strip().split()),
        "evm_address": evm_address,
        "evm_private_key": "0x" + evm_priv.hex(),
        "tron_address": tron_address,
        "tron_private_key": tron_priv.hex(),
    }


def generate_master_crypto_wallet() -> MasterCryptoWallet:
    """Generate a new 12-word BIP-39 Master Wallet with EVM and TRON addresses."""
    mnemonic = generate_bip39_mnemonic(128)
    return derive_wallet_from_mnemonic(mnemonic)


derive_master_wallet_from_mnemonic = derive_wallet_from_mnemonic


def validate_bip39_mnemonic(mnemonic: str) -> bool:
    """Validate that a BIP-39 mnemonic contains 12 or 24 valid English words with valid checksum."""
    words = [w.strip() for w in mnemonic.strip().split() if w.strip()]
    if len(words) not in (12, 24):
        return False
    wordlist = get_bip39_wordlist()
    word_to_idx = {w: i for i, w in enumerate(wordlist)}
    combined = 0
    for w in words:
        idx = word_to_idx.get(w)
        if idx is None:
            return False
        combined = (combined << 11) | idx
    total_bits = len(words) * 11
    checksum_bits = total_bits // 33
    ent_bits = total_bits - checksum_bits
    ent_int = combined >> checksum_bits
    cs_int = combined & ((1 << checksum_bits) - 1)
    entropy = ent_int.to_bytes(ent_bits // 8, "big")
    expected_cs = hashlib.sha256(entropy).digest()[0] >> (8 - checksum_bits)
    return cs_int == expected_cs

