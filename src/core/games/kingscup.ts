/**
 * 킹스 컵 (King's Cup) — 공통 타입과 미션 테이블
 * ----------------------------------------------
 * 서버와 클라이언트가 공유하는 킹스컵 관련 타입을 정의합니다.
 * - 서버(worker/games/kingscup.ts): 게임 로직 + 공개 상태 생성
 * - 클라이언트(src/ui/kingscup.ts): 화면 렌더링
 *
 * 중요: 서버는 카드 덱 전체를 비공개로 들고 있고,
 * 클라이언트에게는 "공개 상태"(뽑힌 카드들만)만 전송합니다.
 */

import type { Card } from "../cards";

/** 게임에 참여 중인 플레이어 (대기실 순서 = 게임 진행 순서) */
export interface KingsCupPlayerView {
  id: string;
  name: string;
}

/** 서버 → 클라이언트로 전송하는 킹스컵 공개 상태 (숨김 정보 없음) */
export interface KingsCupPublicState {
  deckSize: number;                    // 남은 카드 수 (카드 내용은 비공개)
  revealed: { card: Card; byName: string }[]; // 지금까지 뽑힌 카드 (공개)
  turnIndex: number;                   // 현재 턴 플레이어의 players 배열 인덱스
  players: KingsCupPlayerView[];       // 참여자 (진행 순서)
  kingsDrawn: number;                  // 뽑힌 킹(K)의 개수 (0~4)
  finished: boolean;                   // 4번째 킹이 뽑혔는지 여부
}

/**
 * 클라이언트 → 서버 액션 데이터 타입.
 * ActionMsg.data에 담겨 오며, 서버는 kind로 어떤 요청인지 구분합니다.
 */
export interface KingsCupAction {
  kind: "draw"; // 카드 뽑기 (현재 턴 플레이어만 유효)
}

/** 카드 한 장(랭크)에 대응하는 미션 정보 */
export interface KingsCupMission {
  title: string; // 미션 이름
  rule: string;  // 미션 규칙 설명
}

/**
 * 킹스컵 미션 테이블 (랭크 → 미션).
 * 게임의 "재미 요소"인 규칙 텍스트는 표현 계층(클이언트)에 두고,
 * 서버는 카드를 뽑고 공개하는 역할만 담당합니다.
 */
export const KINGS_CUP_MISSIONS: Record<string, KingsCupMission> = {
  ace: {
    title: "폭포 (Waterfall)",
    rule: "방향을 정해 한 명이 마시기 시작합니다. 앞 사람이 마시는 동안 뒷 사람도 마시고, 앞 사람이 멈출 때까지 전원 계속 마십니다.",
  },
  "2": {
    title: "지목 (You)",
    rule: "원하는 사람 한 명을 지목합니다. 지목당한 사람이 마십니다.",
  },
  "3": {
    title: "나 (Me)",
    rule: "카드를 뽑은 본인이 마십니다.",
  },
  "4": {
    title: "바닥 (Floor)",
    rule: "전원이 손바닥을 바닥에 대는데, 가장 마지막에 댄 사람이 마십니다.",
  },
  "5": {
    title: "남자 (Guys)",
    rule: "남자 전원이 마십니다.",
  },
  "6": {
    title: "여자 (Chicks)",
    rule: "여자 전원이 마십니다.",
  },
  "7": {
    title: "하늘 (Heaven)",
    rule: "전원이 손을 들되, 가장 마지막에 든 사람이 마십니다.",
  },
  "8": {
    title: "짝꿍 (Mate)",
    rule: "짝꿍 한 명을 지정합니다. 짝꿍이 마실 때마다 나도 같이 마십니다.",
  },
  "9": {
    title: "라임 (Rhyme)",
    rule: "단어를 하나씩 말하며 라임(울림)을 이어나갑니다. 3초 안에 못 이으면 마십니다.",
  },
  "10": {
    title: "카테고리 (Categories)",
    rule: "카테고리를 정해 한 명씩 답합니다. 중복되거나 못 하면 마십니다.",
  },
  jack: {
    title: "규칙 (Rule)",
    rule: "게임에 적용할 규칙 하나를 정합니다 (예: 이름 대신 존칭 사용). 규칙을 어기면 마십니다.",
  },
  queen: {
    title: "질문 마스터 (Question Master)",
    rule: "뽑은 사람이 질문하면 대답 대신 다른 사람이 마셔야 합니다. 뽑은 사람이 대답을 하면 본인이 마십니다.",
  },
  king: {
    title: "컵 따르기 (King's Cup)",
    rule: "중앙 컵에 음료를 붓습니다. 4번째 킹을 뽑은 사람이 컵 전체를 마시고 게임이 끝납니다.",
  },
};
