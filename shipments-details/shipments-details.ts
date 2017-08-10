import { Component, Input, OnInit } from '@angular/core';
import { NavController, NavParams, AlertController } from 'ionic-angular';
import { TranslateService} from 'ng2-translate';
import { Keyboard } from 'ionic-native';

import { EncodeJSONRead } from '../../json/encode-json-read'
import { EncodeJSONWrite } from '../../json/encode-json-write'
import { TrytonProvider } from '../../providers/tryton-provider'

// Interfaces
import { Move } from '../../../models/interfaces/move';
import { Shipment } from '../../../models/interfaces/shipment';

@Component({
  selector: 'page-shipments-details',
  templateUrl: 'shipments-details.html'
})
export class ShipmentsDetailsPage implements OnInit{

     @Input() itemInput: string;

    /**
     * moves of the current Shipment
     * @type {Move[]}
     */
    shipmentLines: Move[] = [];

    /**
     * Current shipment
     * @type {Shipment}
     */
    shipment: Shipment;

    fields: Array<string>;
    domain: Array<any>;

    lastItem: Move;

    saved: boolean = false;


    constructor(public navCtrl: NavController, public navParams: NavParams,
        public trytonProvider: TrytonProvider, public translateService: TranslateService,
        public alertCtrl: AlertController) {

        this.shipment = navParams.get('shipment')
        this.fields = ["product", "product.rec_name",
            "quantity", "uom", "state", "product.code", "scanned_quantity",
            "company", "from_location", "to_location"]
        let json_constructor = new EncodeJSONRead;
        this.domain = [
            json_constructor.createDomain('shipment', '=',
                'stock.shipment.internal,' + this.shipment.id)
        ];
    }

    ngOnInit() {
        console.log('Loading moves for shipment', this.shipment);
        this.loadshipmentLines()
    }

    ngAfterViewInit(){
        console.log("Closing")
        Keyboard.show();
        document.getElementById('test').focus()
        Keyboard.close()
    }

    public inputChange(event) {
        if (Number(this.itemInput) > 100000) {
            // Wait for results
            let result = this.searchProductCode(this.itemInput).then(
               data => {
                    console.log("Data", data)
                    // Filter elements by product id
                    let line = this.shipmentLines.filter(i =>
                            i.product == data.id)[0]

                    if (this.checkQuantity(line, 1)){
                        if (this.checkReminders()){
                            this.save(false);
                            return this.setStage(this.shipment.state)
                        }
                    }
                    else this.lastItem = line;
                    this.itemInput = '';
                    return false;
               },
               error => {
                   console.log("ERROR")
                   return false
            })
            console.log("Result", result)
            /*if (result){
                this.leaveView()
            }*/

        }
        else if (this.lastItem){
            if (this.checkQuantity(this.lastItem, Number(this.itemInput))){
                if (this.checkReminders()){
                    this.setStage(this.shipment.state);
                    this.lastItem = undefined;
                }
            }
        }
        else {
            this.translateService.get('NO_GIVEN_PRODUCT').subscribe(
                value => {
                    alert(value)
                }
            )
        }
        this.itemInput = '';
    }

    /**
     * Checks if the given quantity matches with line quantity
     * @param  {Move}    line     Line to check
     * @param  {number}  quantity Quantity to check
     * @return {boolean}          True if it matches
     */
    public checkQuantity(line: Move, quantity:number): boolean {
        console.log("Line", line)
        if (line.state == "done") return false

        let index = this.shipmentLines.indexOf(line);

        if (line.quantity == quantity){
            this.shipmentLines[index].state = "done";
            this.shipmentLines[index].scanned_quantity = quantity
            return true;
        }
        else if (line.expected_quantity < quantity){
            alert("Quantity entered is bigger than line quantity");
        }
        else {
            this.shipmentLines[index].scanned_quantity += quantity;
        }
        return false;

    }
    /**
     * Saves the current shipment
     * @param  {boolean = true}  showMessage If true it considers the shipment to
     *                                       have been called by the user, thus
     *                                       we just save the scanned quantity and the state
     * @return {[type]}       [description]
     */
    public save(showMessage: boolean = true){
        // Create write procedure (a bit hacky but allows us to create
        // all the records at once)
        let shipment = this.shipment;
        let to_write:any = ['write'];
        for (let line of shipment.moves) {

            delete line.expected_quantity;
            to_write.push([line.id]);

            if (!showMessage){
                to_write.push(
                    {
                        'quantity': line.scanned_quantity,
                        'scanned_quantity': line.scanned_quantity,
                        'state': line.state
                    });
            }
            else
                to_write.push(
                    {
                        'scanned_quantity': line.scanned_quantity,
                        'state': line.state
                    });
        }
        shipment.moves = [to_write];
        console.log("Starting save", shipment)

        let json_constructor = new EncodeJSONWrite;
        let method = 'stock.shipment.internal'

        json_constructor.addNode(method, [shipment.id, shipment]);
        let json = json_constructor.createJSON();

        this.trytonProvider.write(json).subscribe(
            data => {
                console.log("Got response!", data);
                if (showMessage){
                    this.translateService.get('SAVE_SUCCESSFUL').subscribe(
                        value => {
                            let alert = this.alertCtrl.create({
                                title: value,
                                buttons: ['Ok']
                            });
                            alert.present();
                            }
                        )
                }
                    this.saved = true;
            },
            error => {
                console.log("Error", error);
                if (error.error = "tryton:UserError") {
                    let splitted_error = error.messages[0].split('"');
                    let product_name = splitted_error[1];
                    let amount = splitted_error[3]
                    this.translateService.get('SAVE_ERROR',
                        {product: product_name, amount: amount})
                    .subscribe(
                        value => {
                            let alert = this.alertCtrl.create({
                                title: 'ERROR',
                                subTitle: error.messages[0],
                                buttons: ['Ok']
                            });
                            alert.present();
                        }
                    );
                }
                else {
                    this.translateService.get('ERROR_FATAL', {error: error.messages})
                    .subscribe(
                        value => {
                            let alert = this.alertCtrl.create({
                                title: value,
                                buttons: ['Ok']
                            });
                            alert.present();
                        }
                    );
                }
            });
    }
    /**
     * Called when the user clicks the next state on the html view
     * @param {string} stateName Name of the current state
     */
    public nextStage(stateName: string): void {
        // Save it beforehand
        this.save(false);
        this.setStage(stateName);
    }
    /**
     * Sets the next logical state for the current shipment
     * @param  {string} stateName Current state of the shipment
     * @return {boolean}           return true if the shipment is in the final state
     */
    public setStage(stateName: string) : boolean {
        console.log("Setting the next transition for current state", stateName)
        /**
         * Transitions name, first value is the name of the next state
         * second value is the name of the function
         * @type {Object}
         */
        let transitions = {
            'draft': 'waiting',
            'waiting': 'assigned',
            'assigned': 'done',
            'done': undefined
        }

        let model = undefined;
        let next_stage = transitions[stateName];
        switch (next_stage){

            case 'waiting':
                model = "model.stock.shipment.internal.wait";
                break;
            case 'assigned':
                model = "model.stock.shipment.internal.assign_try";
                break;
            case 'done':
                model = "model.stock.shipment.internal.done";
                break;
            default:
                model = undefined;
                break;
        }
        console.log("Setting model", model)
        if (model){
            console.log("Setting next stage, calling model", model)
            this.trytonProvider.rpc_call(model, [[this.shipment.id]])
            .subscribe(
                data => {
                    console.log("Next stage set correctly", data, data.result);
                    if (data.result == false){
                        alert("Unable to assign")
                        return
                    }
                    // Recursively call setStage until the state is done
                    this.setStage(next_stage);
                },
                error => {
                    console.log("An error ocurred while setting state", next_stage)
                    let alert = this.alertCtrl.create({
                        title: "Error",
                        subTitle: error.messages[0],
                        buttons: ['Ok']
                    });
                    alert.present();
                }
            )
        }
        else {
            /*
            this.translateService.get('SHIPMENT_DONE').subscribe(
                value => {
                    let alert = this.alertCtrl.create({
                        title: value,
                        buttons: [{
                            text:'Ok',
                            handler: () => {
                                this.navCtrl.pop()
                            }
                    }]
                    });
                    alert.present();
            })*/
            return true;
        }
    }
    /**
     * Shows a message before leaving
     */
    public leaveView() {
        console.log("Leaving view")
        this.translateService.get('LEAVING_SHIPMENT_DETAILS').subscribe(
            value => {
                let confirm = this.alertCtrl.create({
                    title: value,
                    message: '',
                    enableBackdropDismiss: false,
                    buttons: [{
                        text: 'OK',
                        handler: () => {
                            this.navCtrl.pop()
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
     * Searchs the rec_name of a product for a match
     * @param  {string}       code Code to match
     * @return {Promise<any>}      Id of the product if it matches
     */
    private searchProductCode(code: string): Promise<any> {

        return new Promise<number>((resolve, reject) =>{
            let json_constructor = new EncodeJSONRead;
            let product_domain = [json_constructor.createDomain(
                'rec_name', '=', code)]
            let method = "product.product"
            json_constructor.addNode(method, product_domain, ["id"])
            let json = json_constructor.createJson()
            this.trytonProvider.search(json).subscribe(
                data => {
                    console.log("Item exisits", data);
                    // This should only return one value
                    resolve(data[method][0]);
                },
                error => {
                    console.log("A wild error appeared", error);
                    reject()
                })
        })
    }

    /**
     * Checks if there are more moves in the shipment
     * @return {boolean} true if there are not
     */
    private checkReminders(): boolean {
        let is_done: boolean = true
        for (let line of this.shipment.moves) {
            if (line.state != "done"){
                is_done = false;
                break;
            }
        }
        return is_done;
    }

    /**
     * Loads all the moves of a shipment
     * @return
     */
    private loadshipmentLines() {
        let method = "stock.move";
        let json_constructor = new EncodeJSONRead;

        json_constructor.addNode(method, this.domain, this.fields);

        let json = json_constructor.createJson();

        this.trytonProvider.search(json).subscribe(
            data => {
                this.shipmentLines = data[method];
                this.shipment.moves = this.shipmentLines
                console.log("shipmentLines", this.shipmentLines)
            },
            error => {
                console.log("A wild error ocurred", error)
            }

        )

    }
}
