import {
  STAGE_ORDER,
  STAGE_UI_MAP,
  STAGE_BASE_MAP,
  UI_STAGE_NODES,
} from './bitable.constants';

export function getUiStageFromBase(
  baseStage: string,
  reviewStatus = '',
): string {
  if (
    baseStage === '埋点设计' &&
    reviewStatus &&
    reviewStatus !== '草稿'
  ) {
    return '埋点评审';
  }
  return STAGE_UI_MAP[baseStage] || baseStage;
}

export function getBaseStageFromUi(uiStage: string): string {
  return STAGE_BASE_MAP[uiStage] || uiStage;
}

export function getStageIndex(baseStage: string): number {
  return STAGE_ORDER.indexOf(baseStage);
}

export function isStageTransitionValid(
  currentStage: string,
  targetStage: string,
): boolean {
  const currentIdx = getStageIndex(currentStage);
  const targetIdx = getStageIndex(targetStage);

  if (currentIdx === -1 || targetIdx === -1) {
    return false;
  }

  return targetIdx >= currentIdx;
}

export function getUiNodeIndex(uiStage: string): number {
  return UI_STAGE_NODES.indexOf(uiStage === '埋点校验' ? '埋点验收' : uiStage);
}

export function getCurrentUiNode(baseStage: string, reviewStatus = ''): string {
  return getUiStageFromBase(baseStage, reviewStatus);
}

export function isUiNodeCompleted(
  baseStage: string,
  uiNode: string,
  reviewStatus = '',
): boolean {
  const currentUiStage = getUiStageFromBase(baseStage, reviewStatus);
  const currentIdx = getUiNodeIndex(currentUiStage);
  const nodeIdx = getUiNodeIndex(uiNode);

  if (currentIdx === -1 || nodeIdx === -1) {
    return false;
  }

  return nodeIdx < currentIdx;
}

export function isUiNodeActive(
  baseStage: string,
  uiNode: string,
  reviewStatus = '',
): boolean {
  const currentUiStage = getUiStageFromBase(baseStage, reviewStatus);
  return currentUiStage === (uiNode === '埋点校验' ? '埋点验收' : uiNode);
}

export interface StagePermissions {
  canEditRequirement: boolean;
  canEditDesign: boolean;
  canEditReview: boolean;
  canEditDev: boolean;
  canEditAcceptance: boolean;
  canEditLaunch: boolean;
  canEditArchive: boolean;
  canEditParams: boolean;
}

export function calculatePermissions(
  userId: string,
  dataOwner: string[] = [],
  devOwner: string[] = [],
  dsAcceptor: string[] = [],
): StagePermissions {
  const isDs =
    dataOwner.includes(userId) || dsAcceptor.includes(userId);
  const isDevOwner = devOwner.includes(userId);

  return {
    canEditRequirement: isDs || isDevOwner,
    canEditDesign: isDs || isDevOwner,
    canEditReview: isDs || isDevOwner,
    canEditDev: isDevOwner,
    canEditAcceptance: isDs,
    canEditLaunch: isDs,
    canEditArchive: isDs,
    canEditParams: isDs || isDevOwner,
  };
}

export function hasAnyPermission(permissions: StagePermissions): boolean {
  return Object.values(permissions).some((v) => v === true);
}
