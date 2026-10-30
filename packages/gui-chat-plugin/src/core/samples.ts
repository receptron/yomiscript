// Sample calls, written by an LLM (Codex) for eval/browser_tts: Japanese homographs and English.
import type { ToolSample } from "gui-chat-protocol";

export const SAMPLES: ToolSample[] = [
  { name: "一日 (ついたち)", args: { yomiscript: "ja /tsɯitatɕi<t:一日> kaɾa<t:から> mikka<t:三日> made<t:まで> jasɯmi<t:休み> desɯ<t:です。> ↘/" } },
  {
    name: "上手 (かみて)",
    args: { yomiscript: "ja /bɯtai<t:舞台> no<t:の> kamite<t:上手> kaɾa<t:から> jakɯɕa<t:役者> ɡa<t:が> toːdʑoː<t:登場> ɕita<t:した。> ↘/" },
  },
  {
    name: "人気 (ひとけ)",
    args: { yomiscript: "ja /kono<t:この> ataɾi<t:辺り> wa<t:は> joɾɯ<t:夜> ɲi<t:に> naɾɯ<t:なる> to<t:と> çitoke<t:人気> ɡa<t:が> nai<t:ない。> ↘/" },
  },
  { name: "Date", args: { yomiscript: "ja /dʑɯːɡatsɯ<t:10月> ɲidʑɯːjokka<t:24日> ɲi<t:に> kaiɡi<t:会議> ɡa<t:が> aɾɯ<t:ある。> ↘/" } },
  {
    name: "Japanese, two sentences",
    args: { yomiscript: "ja /ame<t:雨> ɡa<t:が> jami<t:止み> maɕita<t:ました。> ↘ sampo<t:散歩> ɲi<t:に> iki<t:行き> maɕoː<t:ましょう。> ↘/" },
  },
  {
    name: "English question",
    args: { yomiscript: "en-US /dɪd<t:Did> ju<t: you> ɹɪ.ˈmɛm.bəɹ<t: remember> tə<t: to> ˈlɑk<t: lock> ðə<t: the> ˈfɹʌnt<t: front> ˈdɔɹ<t: door?> ↗/" },
  },
  {
    name: "English numbers",
    args: {
      yomiscript:
        "en-US /ðə<t:The> ˈmi.ɾɪŋ<t: meeting> ˈstɑɹts<t: starts> æt<t: at> ˈnaɪn ˈθɝ.ɾi<t: 9:30> ɑn<t: on> ˈmɑɹtʃ<t: March> ˈθɝd<t: 3rd,> ‖ ˈtwɛn.ti ˈtwɛn.ti ˈsɪks<t: 2026.> ↘/",
    },
  },
];
