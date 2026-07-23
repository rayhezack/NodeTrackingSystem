import {
  STAGE_ORDER,
  STAGE_UI_MAP,
  STAGE_BASE_MAP,
  UI_STAGE_NODES,
} from './bitable.constants';

export function getUiStageFromBase(baseStage: string): string {
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
  return UI_STAGE_NODES.indexOf(uiStage);
}

export function getCurrentUiNode(baseStage: string): string {
  return getUiStageFromBase(baseStage);
}

export function isUiNodeCompleted(
  baseStage: string,
  uiNode: string,
): boolean {
  const currentUiStage = getUiStageFromBase(baseStage);
  const currentIdx = getUiNodeIndex(currentUiStage);
  const nodeIdx = getUiNodeIndex(uiNode);

  if (currentIdx === -1 || nodeIdx === -1) {
    return false;
  }

  return nodeIdx < currentIdx;
}

export function isUiNodeActive(baseStage: string, uiNode: string): boolean {
  const currentUiStage = getUiStageFromBase(baseStage);
  return currentUiStage === uiNode;
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
    canEditRequirement: isDs,
    canEditDesign: isDs,
    canEditReview: isDs,
    canEditDev: isDevOwner,
    canEditAcceptance: isDs,
    canEditLaunch: isDs,
    canEditArchive: isDs,
    canEditParams: isDs,
  };
}

export function hasAnyPermission(permissions: StagePermissions): boolean {
  return Object.values(permissions).some((v) => v === true);
}
