import {
  isStageTransitionValid,
  getUiStageFromBase,
  getBaseStageFromUi,
  isUiNodeCompleted,
  isUiNodeActive,
  calculatePermissions,
  hasAnyPermission,
} from '../../server/modules/bitable/bitable.utils';

describe('阶段映射工具', () => {
  describe('getUiStageFromBase', () => {
    it('应正确映射 Base 枚举值到 UI 业务节点', () => {
      expect(getUiStageFromBase('需求录入')).toBe('埋点提需');
      expect(getUiStageFromBase('埋点设计')).toBe('埋点设计');
      expect(getUiStageFromBase('评审通过')).toBe('埋点开发');
      expect(getUiStageFromBase('埋点开发')).toBe('埋点开发');
      expect(getUiStageFromBase('数据验收')).toBe('埋点校验');
      expect(getUiStageFromBase('上线监控')).toBe('埋点上线');
      expect(getUiStageFromBase('稳定归档')).toBe('归档');
      expect(getUiStageFromBase('已废弃')).toBe('归档');
    });

    it('未知阶段应返回原值', () => {
      expect(getUiStageFromBase('未知阶段')).toBe('未知阶段');
    });
  });

  describe('getBaseStageFromUi', () => {
    it('应正确映射 UI 业务节点到 Base 枚举值', () => {
      expect(getBaseStageFromUi('埋点提需')).toBe('需求录入');
      expect(getBaseStageFromUi('埋点设计')).toBe('埋点设计');
      expect(getBaseStageFromUi('埋点开发')).toBe('埋点开发');
      expect(getBaseStageFromUi('埋点校验')).toBe('数据验收');
      expect(getBaseStageFromUi('埋点上线')).toBe('上线监控');
      expect(getBaseStageFromUi('归档')).toBe('稳定归档');
    });
  });
});

describe('阶段合法性校验', () => {
  describe('isStageTransitionValid', () => {
    it('应允许向前推进阶段', () => {
      expect(isStageTransitionValid('需求录入', '埋点设计')).toBe(true);
      expect(isStageTransitionValid('需求录入', '埋点开发')).toBe(true);
      expect(isStageTransitionValid('埋点设计', '数据验收')).toBe(true);
      expect(isStageTransitionValid('埋点开发', '稳定归档')).toBe(true);
    });

    it('应允许保持在同一阶段', () => {
      expect(isStageTransitionValid('需求录入', '需求录入')).toBe(true);
      expect(isStageTransitionValid('埋点开发', '埋点开发')).toBe(true);
    });

    it('应禁止向后回退阶段', () => {
      expect(isStageTransitionValid('埋点设计', '需求录入')).toBe(false);
      expect(isStageTransitionValid('埋点开发', '埋点设计')).toBe(false);
      expect(isStageTransitionValid('稳定归档', '上线监控')).toBe(false);
    });

    it('未知阶段应返回 false', () => {
      expect(isStageTransitionValid('未知', '埋点设计')).toBe(false);
      expect(isStageTransitionValid('需求录入', '未知')).toBe(false);
    });
  });
});

describe('UI 节点状态判断', () => {
  describe('isUiNodeCompleted', () => {
    it('当前阶段之前的节点应为已完成', () => {
      expect(isUiNodeCompleted('埋点开发', '埋点提需')).toBe(true);
      expect(isUiNodeCompleted('埋点开发', '埋点设计')).toBe(true);
    });

    it('当前阶段的节点不应为已完成', () => {
      expect(isUiNodeCompleted('埋点开发', '埋点开发')).toBe(false);
    });

    it('当前阶段之后的节点不应为已完成', () => {
      expect(isUiNodeCompleted('埋点设计', '埋点开发')).toBe(false);
      expect(isUiNodeCompleted('埋点提需', '归档')).toBe(false);
    });
  });

  describe('isUiNodeActive', () => {
    it('应正确判断当前激活节点', () => {
      expect(isUiNodeActive('需求录入', '埋点提需')).toBe(true);
      expect(isUiNodeActive('埋点设计', '埋点设计')).toBe(true);
      expect(isUiNodeActive('评审通过', '埋点开发')).toBe(true);
      expect(isUiNodeActive('埋点开发', '埋点开发')).toBe(true);
      expect(isUiNodeActive('数据验收', '埋点校验')).toBe(true);
      expect(isUiNodeActive('上线监控', '埋点上线')).toBe(true);
      expect(isUiNodeActive('稳定归档', '归档')).toBe(true);
      expect(isUiNodeActive('已废弃', '归档')).toBe(true);
    });

    it('非当前阶段节点应为 false', () => {
      expect(isUiNodeActive('需求录入', '埋点设计')).toBe(false);
      expect(isUiNodeActive('埋点开发', '埋点提需')).toBe(false);
    });
  });
});

describe('权限判断工具', () => {
  const dsUserId = 'ds_user_1';
  const devUserId = 'dev_user_1';
  const dsAcceptorId = 'ds_acceptor_1';
  const otherUserId = 'other_user_1';

  describe('calculatePermissions', () => {
    it('DS（数据负责人）应拥有全部 DS 侧权限', () => {
      const perms = calculatePermissions(dsUserId, [dsUserId], [], []);
      expect(perms.canEditRequirement).toBe(true);
      expect(perms.canEditDesign).toBe(true);
      expect(perms.canEditReview).toBe(true);
      expect(perms.canEditDev).toBe(false);
      expect(perms.canEditAcceptance).toBe(true);
      expect(perms.canEditLaunch).toBe(true);
      expect(perms.canEditArchive).toBe(true);
      expect(perms.canEditParams).toBe(true);
    });

    it('DS 验收人应拥有 DS 侧权限', () => {
      const perms = calculatePermissions(dsAcceptorId, [], [], [dsAcceptorId]);
      expect(perms.canEditRequirement).toBe(true);
      expect(perms.canEditDesign).toBe(true);
      expect(perms.canEditReview).toBe(true);
      expect(perms.canEditDev).toBe(false);
      expect(perms.canEditAcceptance).toBe(true);
      expect(perms.canEditLaunch).toBe(true);
      expect(perms.canEditArchive).toBe(true);
      expect(perms.canEditParams).toBe(true);
    });

    it('研发负责人应拥有开发侧权限', () => {
      const perms = calculatePermissions(devUserId, [], [devUserId], []);
      expect(perms.canEditRequirement).toBe(false);
      expect(perms.canEditDesign).toBe(false);
      expect(perms.canEditReview).toBe(false);
      expect(perms.canEditDev).toBe(true);
      expect(perms.canEditAcceptance).toBe(false);
      expect(perms.canEditLaunch).toBe(false);
      expect(perms.canEditArchive).toBe(false);
      expect(perms.canEditParams).toBe(false);
    });

    it('既是 DS 又是研发负责人应拥有全部权限', () => {
      const perms = calculatePermissions(dsUserId, [dsUserId], [dsUserId], []);
      expect(perms.canEditRequirement).toBe(true);
      expect(perms.canEditDesign).toBe(true);
      expect(perms.canEditReview).toBe(true);
      expect(perms.canEditDev).toBe(true);
      expect(perms.canEditAcceptance).toBe(true);
      expect(perms.canEditLaunch).toBe(true);
      expect(perms.canEditArchive).toBe(true);
      expect(perms.canEditParams).toBe(true);
    });

    it('无匹配负责人时所有权限为 false', () => {
      const perms = calculatePermissions(otherUserId, [dsUserId], [devUserId], [dsAcceptorId]);
      expect(perms.canEditRequirement).toBe(false);
      expect(perms.canEditDesign).toBe(false);
      expect(perms.canEditReview).toBe(false);
      expect(perms.canEditDev).toBe(false);
      expect(perms.canEditAcceptance).toBe(false);
      expect(perms.canEditLaunch).toBe(false);
      expect(perms.canEditArchive).toBe(false);
      expect(perms.canEditParams).toBe(false);
    });

    it('空负责人数组时所有权限为 false', () => {
      const perms = calculatePermissions(otherUserId, [], [], []);
      expect(hasAnyPermission(perms)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('有任一权限时应返回 true', () => {
      const perms = calculatePermissions(dsUserId, [dsUserId], [], []);
      expect(hasAnyPermission(perms)).toBe(true);
    });

    it('无任何权限时应返回 false', () => {
      const perms = calculatePermissions(otherUserId, [], [], []);
      expect(hasAnyPermission(perms)).toBe(false);
    });
  });
});
