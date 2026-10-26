import { render } from 'preact';
import { App } from './app/App';
import { SimClient } from './app/client';
import { music } from './app/music';
import './styles.css';

music.install();
render(<App client={SimClient.spawn()} />, document.getElementById('app')!);
