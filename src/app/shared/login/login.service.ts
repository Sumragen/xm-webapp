import {Injectable} from '@angular/core';
import { Router } from '@angular/router';

import {JhiLanguageService} from 'ng-jhipster';
import {AuthServerProvider} from '../auth/auth-jwt.service';
import {Principal} from '../auth/principal.service';
import {StateStorageService} from '../auth/state-storage.service';

@Injectable()
export class LoginService {

    constructor(private jhiLanguageService: JhiLanguageService,
                private principal: Principal,
                private router: Router,
                private authServerProvider: AuthServerProvider,
                private stateStorageService: StateStorageService) {
    }

    private getUserIdentity(next, data): void {
      this.principal.identity(true, true).then((account) => {
        // After the login the language will be changed to
        // the language selected by the user during his registration
        if (account !== null && account.langKey) {
          this.jhiLanguageService.changeLanguage(account.langKey);
        }
        if (next) {
          next(data);
        }
      });
    }

    public login(credentials, callback?): Promise<unknown> {

        const cb = callback || function() {
            };

        return new Promise((resolve, reject) => {

            this.authServerProvider.login(credentials).subscribe((data) => {

                if (this.stateStorageService.getDestinationState() && this.stateStorageService.getDestinationState().destination) {
                  const state = this.stateStorageService.getDestinationState().destination;
                  if (state.name && 'otpConfirmation' ===  state.name) {
                      resolve(state.name);
                  } else {
                    this.getUserIdentity(resolve, data);
                  }
                } else {
                  this.getUserIdentity(resolve, data);
                }

                return cb();
            }, (err) => {
              console.log('service-error %o', err);
              this.logout();
              reject(err);
              return cb(err);
            });
        });
    }

    public loginWithToken(jwt, rememberMe): Promise<unknown> {
        return this.authServerProvider.loginWithToken(jwt, rememberMe);
    }

    public logout(): void {
      this.authServerProvider.logout().subscribe();
      this.principal.logout();
      this.router.navigate(['']);
    }
}
