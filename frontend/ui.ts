import {api} from '../api.ts'
import * as uu from './uu.ts'

async function main() {
    const networkInfo = await api.getNetworkInfo('')
    document.body.append(uu.visualizeArray(networkInfo))
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

