/**
 * Reads a report key from the OutLayer enclave, which is the only place the key is held.
 *
 * The browser makes a one-time keypair, seals {report id, one-time public key, sign-in token} to the
 * enclave's public key, and sends that blob through the Redline server. The server cannot read it.
 * Inside the TEE the enclave verifies the sign-in token, checks on chain that the person is the owner
 * or a redeemed, non-revoked invitee, and answers with the report key sealed to the one-time key.
 */
import { PrivateKey, decrypt as eciesDecrypt, encrypt as eciesEncrypt } from "eciesjs";
import { getAuthToken } from "./api-client";
import { fetchEnclaveSealedKey } from "./data-source";
import { redlineConfig } from "./redline-config";
import { fromHex, isValidKeyHex, toHex } from "./report-encryption";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readKeyFromEnclave(reportId: string): Promise<string> {
  const token = await getAuthToken();
  if (!token) throw new Error("Sign in to unlock this report.");
  const ephemeral = new PrivateKey();
  const request = JSON.stringify({ action: "reveal_report", report_id: reportId, eph_pub: ephemeral.publicKey.toHex(false), id_token: token });
  const blob = toHex(eciesEncrypt(redlineConfig.enclavePublicKey, encoder.encode(request)));
  const answer = await fetchEnclaveSealedKey(reportId, blob);
  const keyHex = decoder.decode(eciesDecrypt(ephemeral.secret, fromHex(answer)));
  if (!isValidKeyHex(keyHex)) throw new Error("The enclave answered with something that is not a report key.");
  return keyHex.toLowerCase();
}
