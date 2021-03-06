import { Location } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import swal from 'sweetalert2';
import { PasswordResetInit } from '../../account/password-reset/init/password-reset-init.service';
import { User, UserService } from '../../shared';
import { JhiLanguageHelper } from '../../shared/language/language.helper';
import { UserLogin } from '../../shared/user/login/user-login.model';
import { UserLoginService } from '../../shared/user/login/user-login.service';

@Component({
    selector: 'xm-user-mgmt-detail',
    templateUrl: './user-management-detail.component.html',
})
export class UserMgmtDetailComponent implements OnInit, OnDestroy {

    public user: User;
    public showLoader: boolean;
    public userEmail: string;
    private routeData: any;
    private subscription: any;
    private routeDataSubscription: any;

    constructor(
        private jhiLanguageHelper: JhiLanguageHelper,
        private userService: UserService,
        private userLoginService: UserLoginService,
        private pwsResetService: PasswordResetInit,
        private route: ActivatedRoute,
        private location: Location,
    ) {
        this.routeDataSubscription = this.route.data.subscribe((data) => {
            this.routeData = data;
        });
    }

    public ngOnInit(): void {
        this.subscription = this.route.params.subscribe((params) => {
            this.load(params['userKey']);
        });
    }

    public load(userKey): void {
        this.showLoader = true;
        this.userService
            .find(userKey)
            .subscribe((user) => {
                    this.user = user;
                    this.userEmail = this.getEmail();
                    this.routeData.pageSubSubTitle = user.userKey;
                    this.jhiLanguageHelper.updateTitle();
                },
                (err) => console.log(err),
                () => this.showLoader = false);
    }

    public ngOnDestroy(): void {
        this.subscription.unsubscribe();
        this.routeDataSubscription.unsubscribe();
    }

    public getLogin(login: UserLogin): string {
        return this.userLoginService.getLogin(login);
    }

    public onBack(): void {
        this.location.back();
    }

    public initPasswordReset(): void {
        swal({
            title: `Initiate password reset for ${this.userEmail}?`,
            showCancelButton: true,
            buttonsStyling: false,
            confirmButtonClass: 'btn mat-raised-button btn-primary',
            cancelButtonClass: 'btn mat-raised-button',
            confirmButtonText: 'Yes, reset!',
        }).then((result) => result.value ?
            this.pwsResetService.save(this.userEmail).subscribe(console.log, console.log) :
            console.log('Cancel'));
    }

    public pwdResetDisabled(): boolean {
        return !this.user.activated;
    }

    private getEmail(): string {
        let email = '';
        if (this.user.logins) {
            this.user.logins.forEach((item: UserLogin) => {
                if ('LOGIN.EMAIL' === item.typeKey) {
                    email = item.login;
                }
            });
        }
        return email;
    }

}
