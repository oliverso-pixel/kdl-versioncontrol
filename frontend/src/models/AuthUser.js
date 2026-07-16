import api from '../services/api';

class AuthUser {
  static fromStorage() {
    return new AuthUser({
      token: localStorage.getItem('token'),
      apiMode: localStorage.getItem('apiMode') || 'v2',
      userId: localStorage.getItem('userId'),
      userName: localStorage.getItem('userName'),
      appId: localStorage.getItem('appId'),
      departmentCode: localStorage.getItem('departmentCode'),
      isSuperuser: localStorage.getItem('isSuperuser') === 'true',
      permissionLevel: parseInt(localStorage.getItem('permissionLevel') || '1', 10)
    });
  }

  constructor(data = {}) {
    this.token = data.token || null;
    this.apiMode = data.apiMode || 'v2';
    this.userId = data.userId || null;
    this.userName = data.userName || '';
    this.appId = data.appId || null;
    this.departmentCode = data.departmentCode || null;
    this.isSuperuser = !!data.isSuperuser;
    this.permissionLevel = data.permissionLevel || 1;
  }

  saveToStorage() {
    localStorage.setItem('token', this.token || '');
    localStorage.setItem('apiMode', this.apiMode || 'v2');
    localStorage.setItem('isSuperuser', this.isSuperuser ? 'true' : 'false');
    localStorage.setItem('userId', String(this.userId || ''));
    localStorage.setItem('userName', this.userName || '');
    localStorage.setItem('appId', this.appId || '');
    localStorage.setItem('departmentCode', this.departmentCode || '');
    localStorage.setItem('permissionLevel', String(this.permissionLevel || 1));
  }

  static async loginWithCredentials(username, password) {
    const data = await api.loginV2(username, password);
    
    const isSuper = Boolean(data.user?.is_superuser);
    
    const user = new AuthUser({
      token: data.access_token,
      apiMode: 'v2',
      userId: data.user?.user_id,
      userName: data.user?.user_name,
      appId: data.user?.app_id,
      departmentCode: data.user?.department_code,
      isSuperuser: isSuper,
      permissionLevel: data.user?.permission_level
    });

    user.saveToStorage();

    return user;
  }

  static async loginWithApiKey(apiKey) {
    const data = await api.loginV2(apiKey);
    
    const user = new AuthUser({
      token: data.access_token,
      apiMode: 'v1',
      userName: `API_KEY_${apiKey.substring(0, 4)}...`,
      isSuperuser: false,
      permissionLevel: 1
    });

    user.saveToStorage();

    return user;
  }

  isAccessibleLevel(requiredLevel) {
    if (this.isSuperuser) return true;
    return this.permissionLevel >= requiredLevel;
  }

  static logoutAndClear() {
    const authKeys = [
      'token', 'apiMode', 'isSuperuser', 'userId', 'userName', 'appId', 'departmentCode', 'permissionLevel'
    ];
    authKeys.forEach(key => localStorage.removeItem(key));
  }
}

export default AuthUser;