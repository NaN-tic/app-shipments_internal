import { Component, Input } from '@angular/core';
import { NavController, NavParams, Events, AlertController } from 'ionic-angular';
import { TranslateService } from 'ng2-translate';
import { Locker } from 'angular-safeguard';
import { SessionService } from 'angular2-tryton';

import { InfiniteList } from '../../infinite-list/infinite-list'
import { EncodeJSONRead } from '../../json/encode-json-read'
import { TrytonProvider } from '../../providers/tryton-provider'

//Pages
import { Routing } from '../../../pages/routing/routing'

@Component({
  selector: 'page-shipments-list',
  templateUrl: 'shipments-list.html'
})
/**
 * This class is responsilbe for handeling the list of all the internal shipments
 * that the user has created
 */
export class ShipmentsListPage extends InfiniteList {

  @Input()
  inputReference: string;
  driver = this.locker.useDriver(Locker.DRIVERS.LOCAL)

  constructor(
    public navCtrl: NavController, public navParams: NavParams,
    public tryton_provider: TrytonProvider, public events: Events,
    public translate: TranslateService, public locker: Locker,
    public alertCtrl: AlertController, public tryton_session: SessionService) {

        super(navCtrl, tryton_provider, events);
    }

    ionViewWillEnter() {
        let json_constructor = new EncodeJSONRead
        console.log("Starting search procedure...")
        this.list_items = []
        this.method = "stock.shipment.internal";
        this.offset = 0;
        this.domain = [
            json_constructor.createDomain("state", "in", ['draft', 'waiting']),
            json_constructor.createDomain("employee", "=",
                this.driver.get('UserData').employee)];

        this.fields = ["code", "reference", "total_amount", "state"]
        this.loadData();
    }

    // TODO: FIX
    public newReference() {
        console.log("Change detected on input", this.inputReference);
        if (this.inputReference) {
            let js_enc = new EncodeJSONRead()
            this.domain = [
                js_enc.createDomain("state", "in", "['draft', 'waiting']"),
                js_enc.createDomain("code", '=', this.inputReference)
            ];
            this.loadData()
        }
        else
            this.setDefaultDomain();
     }

    /**
     * Goes to the next view when an item is selected
     * @param  {object} $event Name of the event
     * @param  {object} item   Selected item
     * @return {null}          No return
     */
    public itemSelected($event, item) {
        console.log("Item selected", item)
        this.navCtrl.push(new Routing().getNext(this.constructor.name),
            {shipment: item})
    }

    /**
     * Deletes the given entry from the application
     * @param  {object} $event Event
     * @param  {object} item   Item to delete
     * @return {null}          No return
     */
    public deleteEntry($event, item) {
        console.log("Deleting item", item)
        this.translate.get('DELETE_SHIPMENT').subscribe(
            value => {
                let confirm = this.alertCtrl.create({
                    title: value,
                    message: '',
                    enableBackdropDismiss: false,
                    buttons: [{
                        text: 'OK',
                        handler: () => {
                            this.deleteShipment(item)
                            },
                        }, {
                      text: 'Cancel',
                      handler: () => {
                        return;
                      }
                    }],
                });
            confirm.present();
        });
    }

    /**
     * Logout of the system
     * @param  {event} $event  Click event
     * @return {null}          No return
     */
    public logout($event){
        this.tryton_session.doLogout();
        this.navCtrl.pop();
    }
    /**
     * Refresh data feed
     * @param  {event} refresher Refresh event
     * @return {null}            No return
     */
    public doRefresh(refresher){
        this.setDefaultDomain();
        this.events.subscribe('Data loading finished' ,(eventData) => {
            refresher.complete();
        })
    }

    /**
     * Sets the default domain for the search
     * @return {null} No return
     */
    private setDefaultDomain() {
        let json_constructor = new EncodeJSONRead()
        this.domain = [
            json_constructor.createDomain("state", "in", ['draft', 'waiting']),
            json_constructor.createDomain("employee", "=",
                this.driver.get('UserData').employee)];
            this.loadData()
    }
  /**
   * Get the translation for the given string
   * @param  {string}   text        Text to translate
   * @param  {boolean}  show_alert  Shows an alert if set to true
   * @return {string}               Translated text
   */
    private getTranslation(text: string, show_alert: boolean = false){
       this.translate.get(text).subscribe(
           value => {
               if (show_alert) alert(value);
               return value;
           });
    }

    /**
     * Removes a shipment from the system
     * @param  {object} item Item to delete
     * @return {null}      No return
     */
    private deleteShipment(item){
        console.log("Deleting entry")
        let method = 'model.stock.shipment.internal.delete'
        this.tryton_provider.rpc_call(method, [[item.id]]).subscribe(
            data => {
                console.log("Delete was succesful")
            }
        )
        // Set new array
        this.list_items = this.list_items.filter(i => i !== item);
    }

}
